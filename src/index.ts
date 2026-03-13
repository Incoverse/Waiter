import WaiterLogger, { LOGLEVEL } from "@/lib/log.js";

new WaiterLogger({
  logLevel: LOGLEVEL.DEBUG,
  saveToFile: true,
  colorByLevel: true,
  saveFormatted: false,
  maxLogs: 5,
  logPrefix: "WAITER",
  includeSender: true,
  rootSender: "MNGR",
});

import crypto from "crypto";
import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import SurrealDBController from "./controllers/sdb";
import { IEM } from "./lib/envmgr";

import { fileURLToPath } from "url";
import TwitchController from "./controllers/twitch";
import WebController from "./controllers/web";
const __filename = fileURLToPath(import.meta.url);

global.isCompiled = path.extname(__filename) === ".js";

const waiterInfo = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf-8"),
);

process.on("warning", (warning) => {
  if (warning.name == "TimeoutOverflowWarning") return; // Ignore TimeoutOverflowWarning (from SurrealDB)

  console.warn(warning);
});

config({ quiet: true });

console.info(`Starting Waiter v${waiterInfo.version}`);
console.info(`------------------${"-".repeat(waiterInfo.version.length)}`);

const storedKey = IEM.get("ENCRYPTION_KEY");
if (!storedKey) {
  console.warn("No encryption key found. Generating a new one...");
  const newKey = crypto.randomBytes(16).toString("hex");
  IEM.set("ENCRYPTION_KEY", newKey);
  global.encryptionKey = newKey;
  console.info("New encryption key generated and stored.");
} else {
  global.encryptionKey = storedKey;
  console.info("Encryption key loaded from internal environment.");
}

console.debug(`Starting controller: SurrealDBController`);
const dbController = new SurrealDBController();
await dbController.exec();
console.debug(`Finished executing controller: SurrealDBController`);

console.debug(`Starting controller: WebController`);
const webController = new WebController();
await webController.exec();
console.debug(`Finished executing controller: WebController`);

console.debug(`Starting controller: TwitchController`);
const twitchController = new TwitchController();
await twitchController.exec();
console.debug(`Finished executing controller: TwitchController`);
