import { Controller } from "@/lib/base/controller";
import { getStaticProps } from "@/lib/misc";
import chalk from "chalk";
import ping from "ping";
import prettyMs from "pretty-ms";
import { Surreal } from "surrealdb";
import TableDefinition from "./tables";

type SessionInfo = {
  ac: string;
  db: string;
  ns: string;
  exp: number;
  tk: { AC: string; NS: string; RL: any[]; exp: number };
};

export default class SurrealDBController extends Controller {
  constructor() {
    super("SUDB");
  }

  public async exec() {
    const db = new Surreal();

    global.db = db;

    let hasInternet = await ping.promise
      .probe("1.1.1.1", { timeout: 0.1 })
      .then((res) => res.alive)
      .catch(() => false);

    if (!hasInternet) {
      this.logger.warn(
        chalk.red(
          "No internet connection. Waiting until connection is restored to connect to database.",
        ),
      );
      while (!hasInternet) {
        await new Promise((res) => setTimeout(res, 5000));
        hasInternet = await ping.promise
          .probe("1.1.1.1", { timeout: 0.1 })
          .then((res) => res.alive)
          .catch(() => false);
      }
      this.logger.great(chalk.green("Internet connection restored."));
    }

    this.logger.log("Connecting to database...");

    await connectToDB(db)
      .then(() => {})
      .catch((err) => {
        this.logger.fatal("Error connecting to database:", err.message);
        process.exit(1);
      });

    this.logger.great("Connected to database.");

    const sessionInfo = await qrh.getSessionInfo();

    const dbVersion = (await db.version()).version;

    const dbLoc = `${sessionInfo.db}@${sessionInfo.ns}`;
    const dbUser = sessionInfo.tk.AC;
    const tokenExp = prettyMs(sessionInfo.tk.exp * 1000 - Date.now());

    this.logger.debug(
      `Connected to database ${chalk.yellow(dbLoc)} as ${chalk.yellow(dbUser)}. Token expires in: ${chalk.red(tokenExp)}`,
    );

    this.logger.debug(`SurrealDB version: ${chalk.yellow(dbVersion)}.`);

    let attemptingToReconnect = false;
    setInterval(async () => {
      if (!global.db.isConnected && !attemptingToReconnect) {
        attemptingToReconnect = true;

        if (hasInternet) this.logger.warn(`Lost connection to database. Reconnecting...`);

        const pingResult = await ping.promise
          .probe("1.1.1.1", { timeout: 0.1 })
          .then((res) => res.alive)
          .catch(() => false);

        if (!pingResult) {
          if (hasInternet) this.logger.warn(`No internet connection. Skipping database reconnect attempt.`);
          hasInternet = false;
          attemptingToReconnect = false;
          return;
        }

        await connectToDB(db)
          .then(() => {
            this.logger.great("Reconnected to database.");
          })
          .catch((err) => {
            this.logger.error("Error reconnecting to database:", err);
          });
        attemptingToReconnect = false;
      }
    }, 500);

    await db.query(`DEFINE DATABASE IF NOT EXISTS "${process.env.ACTIVE_DB}";`);

    await db.use({
      database: process.env.ACTIVE_DB,
      namespace: "Waiter",
    });

    for (const [tableName, tableDef] of getStaticProps(TableDefinition)) {
      if (typeof tableDef !== "string") continue; //? Skip non-string static props
      this.logger.debug(`Loading table definition ${chalk.yellow(tableName)}...`);
      await db.query(tableDef).then(() => {
        this.logger.debug(`Loaded table definition ${chalk.yellow(tableName)}.`);
      })
    }
  }
}

const connectToDB = (db: Surreal) =>
  Promise.race([
    db.connect("wss://inimicalpart.com:13244", {
      namespace: "Waiter",
      database: process.env.ACTIVE_DB,
      authentication: process.env.SURREAL_JWT,
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Connection timeout after 5000ms")),
        5000,
      ),
    ),
  ]);

//? Quick Reference Handbook (QRH) for SurrealDB queries. Use this to avoid having to write the same queries multiple times across the codebase. Add any commonly used queries here for easy access.
export const qrh = {
  getSessionInfo: async (): Promise<SessionInfo> => 
    ((await global.db.query("$session").collect()) as SessionInfo[])[0],
  getVersion: async (): Promise<string> =>
    await global.db.version().then((res) => res.version),
};
