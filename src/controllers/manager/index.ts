import { Controller } from "@/lib/base/controller";
import CacheManager from "@/lib/cache";
import Communication from "@/lib/communication";
import type TwitchClient from "@twitch/client";
import crypto from "crypto";
import type { Request, Response } from "express";
import { Server } from "socket.io";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { RecordId } from "surrealdb";
import z, { ZodType } from "zod";
import { registerRoute } from "../web";
import ManagerClient from "./client";
import type { JSONObject, WaiterSocket } from "./interfaces/global";


let hasRegisteredShutdownHooks = false;
let hasRunClientCleanup = false;

async function cleanupAllClients() {
  if (hasRunClientCleanup) {
    return;
  }
  hasRunClientCleanup = true;

  const twitchClients: TwitchClient[] = [];
  if (global.twitch?.bot) {
    twitchClients.push(global.twitch.bot);
  }
  if (global.twitch?.streamers) {
    twitchClients.push(...global.twitch.streamers.values());
  }

  await Promise.allSettled(twitchClients.map((client) => client.cleanup()));

  // Manually disconnect tracked manager clients first.
  if (global.manager?.clients) {
    for (const managerClient of global.manager.clients.values()) {
      managerClient.disconnect();
    }
    global.manager.clients.clear();
  }

  // Then disconnect any remaining sockets known by socket.io.
  if (global.manager?.io) {
    for (const socket of global.manager.io.of("/").sockets.values()) {
      socket.disconnect(true);
    }

    await new Promise<void>((resolve) => {
      try {
        global.manager.io.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }
}

export default class ManagerController extends Controller {

  public override priority: number = Number.MAX_SAFE_INTEGER; //? Ensure this controller loads after all other controllers, so that it can have the most up-to-date information when clients connect and request data.
  
  constructor() {
    super("WMGR", "#1900ff");
    this.waitForControllers("HTTP", "TWCH", "SUDB"); // ? Depends on the web controller for socket management and the Twitch and SurrealDB controllers for validating incoming connections against streamers in the database.
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Ready to accept manager client connections.`);
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      manager: z.object({
        github: z.object({
          token: z.string().describe("The GitHub personal access token for API authentication to retrieve the latest Waiter Manager releases"),
          repository: z.object({
            owner: z.string().describe("The owner of the GitHub repository where the latest Waiter Manager releases are stored").default("Incoverse"),
            name: z.string().describe("The name of the GitHub repository where the latest Waiter Manager releases are stored").default("WaiterManager"),
          }).default({ owner: "Incoverse", name: "WaiterManager" }),
        })
      })
    }) satisfies z.ZodType<Pick<WaiterConfig, "manager">>
  }

  public async exec() {
    const io = new Server(global.web.server, {'transports': ['websocket', 'polling']})
    global.manager = {
      controller: this,
      clients: new Set<ManagerClient>(),
      io,
      communication: new Communication(),
    }
    
    if (!hasRegisteredShutdownHooks) {
      hasRegisteredShutdownHooks = true;

      process.once("beforeExit", () => {
        void cleanupAllClients();
      });

      process.once("SIGINT", () => {
        void cleanupAllClients().finally(() => process.exit(0));
      });

      process.once("SIGTERM", () => {
        void cleanupAllClients().finally(() => process.exit(0));
      });
    }

    // Auth check, has to have an id that is only digits
    io.use(async (socket, next) => {
      const id = socket.handshake.auth.id;
      if (!id) {
        return next(new Error("Invalid ID"));
      }

      if (!global.db.isConnected) {
        return next(new Error("Waiter is not connected to the database yet. Please try again later."));
      }

      let waiterUser = await global.db.query("SELECT * FROM users WHERE id = $wuid FETCH twitch", {
        wuid: new RecordId("users", id),
      }).then((results) => results[0]?.[0]) as any as { id: RecordId, [key: string]: any } | undefined
      if (!waiterUser) {

        const pastIdUser = await global.db.query("SELECT * FROM users WHERE $wuid IN past_ids FETCH twitch", {
          wuid: id,
        }).then((results) => results[0]?.[0]) as any as { id: RecordId, [key: string]: any } | undefined

        if (pastIdUser) {
          waiterUser = pastIdUser;
          this.logger.debug(`A socket attempted to connect as a user that no longer exists due to user linkage. Will allow the connection and tell client to update their ID to the new one.`);
          socket.handshake.auth.updateWuid = waiterUser.id.id.toString();
        } else { 
          return next(new Error("User not found"));
        }
      }

      const isRegisteredStreamer = global.twitch.streamers.values().some((streamer) => streamer.waiterUserId === waiterUser.id.id.toString());

      if (!isRegisteredStreamer) {
        return next(new Error("Streamer not registered with this Waiter instance"));
      }

      if (global.manager.clients.values().some((s) => s.waiterUserId === waiterUser.id.id.toString())) {
        return next(new Error("A manager client is already connected with this user ID. Multiple manager clients for the same user are not allowed."));
      }

      socket.handshake.auth.displayName = waiterUser.twitch?.display_name ?? "UNKNOWN";

      next();
    });

    io.on('connection', (socket: WaiterSocket) => {
      const oldEmit = socket.emit;
      socket.emit = ((eventName: string, data: JSONObject, requestId?: string) => {
        return oldEmit.call(socket, eventName, {
          payload: data,
          requestId: requestId ?? crypto.randomBytes(8).toString("hex"),
        });
      }) as WaiterSocket["emit"];
      const client = new ManagerClient(socket);
      global.manager.clients.add(client);
      
      
      this.logger.log(`Manager[v${socket.handshake.auth.version}] connected for user: ${socket.handshake.auth.displayName} (WUID: ${socket.handshake.auth.updateWuid ?? socket.handshake.auth.id})`);
      global.manager.communication.emit("manager.client_connected", {
        wuid: socket.handshake.auth.id,
        displayName: socket.handshake.auth.displayName,
        version: socket.handshake.auth.version,
        os: socket.handshake.auth.os,
        arch: socket.handshake.auth.arch,
      });

      this.logger.debug(`Manager v${socket.handshake.auth.version ?? "unknown"} running ${socket.handshake.auth.type ?? "unknown"} on ${socket.handshake.auth.hostname ?? "unknown"} (${socket.handshake.auth.os ?? "unknown OS"} as ${socket.handshake.auth.arch ?? "unknown architecture"}).`);
      socket.emit('welcome', {message:`Welcome ${socket.handshake.auth.displayName}! You are successfully connected to the Waiter instance.`});
      
      if (socket.handshake.auth.updateWuid) {
        const requestId = crypto.randomBytes(8).toString("hex");
        socket.once(`receipt.${requestId}`, (data) => {
          if (data.status === "success") {
            this.logger.debug(`Client acknowledged WUID update. Updated WUID to ${socket.handshake.auth.id} successfully.`);
          } else {
            this.logger.warn(`Client failed to acknowledge WUID update.`);
          }
        });
        socket.emit('id.change', { id: socket.handshake.auth.updateWuid }, requestId);
        socket.handshake.auth.id = socket.handshake.auth.updateWuid;
        socket.handshake.auth.updateWuid = undefined;
        this.logger.info(`Instructed client to update their WUID to ${socket.handshake.auth.id} due to user linkage after merge.`);
      }


      socket.on('disconnect', () => {
        global.manager.communication.emit("manager.client_disconnected", {
          wuid: socket.handshake.auth.id,
          displayName: socket.handshake.auth.displayName,
          version: socket.handshake.auth.version,
          os: socket.handshake.auth.os,
          arch: socket.handshake.auth.arch,
        });
        global.manager.clients.delete(client);
        this.logger.log(`Manager client disconnected for user: ${socket.handshake.auth.displayName} (WUID: ${socket.handshake.auth.updateWuid ?? socket.handshake.auth.id})`);
      });

      socket.onAny((event, ...args) => {
        if (event.startsWith("receipt.")) return; // Don't log receipts to avoid clutter

        this.logger.log(`Received event: ${event} with args:`, args);
      });

    });

    this.logger.debug(`ManagerController has set up Socket.IO in parallel with the web controller. Waiting for manager clients to connect...`);
  }


  private cache = new CacheManager();

  @registerRoute("GET", "/api/v1/manager/release/latest")
  public async UpdateEndpoint(req: Request, res: Response) {
    // Fetch metadata from GitHub using your secret token

    const acceptHeader = req.headers["accept"] || "";
    const arch = req.query.arch || "x64";
    const type = req.query.type || "release";

    if (!["x64", "x86"].includes(arch as string)) {
      return res.status(400).json({ error: "INVALID_ARCHITECTURE", message: "Invalid architecture specified. Valid options are x64 and x86." });
    }
    if (!["release", "debug"].includes(type as string)) {
      return res.status(400).json({ error: "INVALID_TYPE", message: "Invalid type specified. Valid options are release and debug." });
    }

    try {
      if (acceptHeader === "application/json") {
        const cached = this.cache.get(`release`);
        if (cached) {
          return res.json({
            version: cached.tag_name,
            released: cached.published_at,

            cached: true,
            cached_at: new Date((this.cache.getExpiry(`release`)?.getTime() ?? 0) - 1000 * 60 * 15).toISOString(), // When it was cached, based on expiry time
          });
        }
      }
      
      const releaseResponse = await fetch(`https://api.github.com/repos/${global.config.manager.github.repository.owner}/${global.config.manager.github.repository.name}/releases/latest`, {
        headers: { 
          "Authorization": `Bearer ${global.config.manager.github.token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });

      if (!releaseResponse.ok) {
        this.logger.error("Failed to fetch latest release info:", releaseResponse.status, releaseResponse.statusText);
        return res.status(500).json({ error: "FETCH_FAILED", message: "Failed to fetch latest release info" });
      }

      const release = this.cache.get(`release`) || (await releaseResponse.json() as any);

      
      if (acceptHeader === "application/json") {
        this.cache.set(`release`, release, 1000 * 60 * 15); // Cache for 15 minutes
        return res.json({
          version: release.tag_name,
          released: release.published_at,

          cached: false,
          cached_at: null,
        });
      }
      
      
      const asset = release.assets.find((a: any) => a.name.endsWith(".exe") && a.name.includes(arch) && a.name?.toLowerCase().includes(type));
      
      if (!asset) {
        return res.status(404).json({ error: "NO_ASSET", message: "No suitable release asset found for the specified architecture and type." });
      }
      
      
      this.logger.log("Latest release asset found:", asset.name, "ID:", asset.id, "Size:", asset.size);
      this.logger.log("Fetching asset...");
      // Now fetch the binary file STREAM using the private token
      const fileRes = await fetch(`https://api.github.com/repos/${global.config.manager.github.repository.owner}/${global.config.manager.github.repository.name}/releases/assets/${asset.id}`, {
        headers: { 
          "Accept": "application/octet-stream",
          "Authorization": `Bearer ${global.config.manager.github.token}`,
        }
      });
      
      if (!fileRes.ok) {
        this.logger.error("Failed to fetch asset:", fileRes.status, fileRes.statusText);
        return res.status(500).json({error: "FETCH_FAILED", message: "Failed to fetch file"});
      }
      
      this.logger.log("Asset fetch finished, streaming to client...");
      if (!fileRes.body) {
        this.logger.error("File response has no body");
        return res.status(502).json({ error: "EMPTY_BODY", message: "GitHub returned an empty response body." });
      }

      res.setHeader("Content-Type", fileRes.headers.get("Content-Type") ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${asset.name}"`);
      const contentLength = fileRes.headers.get("Content-Length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      const nodeReadable = Readable.fromWeb(fileRes.body as any);
      res.status(200);
      await pipeline(nodeReadable, res);
      return;
    } catch (err: any) {
      this.logger.error("Error in UpdateEndpoint:", err);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: err?.message ?? "Unknown error" });
    }
  }
}