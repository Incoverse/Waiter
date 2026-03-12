import WaiterLogger, { LOGLEVEL } from "@/lib/log.js";
import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import SurrealDBController from "./controllers/sdb";

const waiterInfo = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf-8"),
);

config({ quiet: true });

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

console.info(`Starting Waiter v${waiterInfo.version}`);
console.info(`------------------${"-".repeat(waiterInfo.version.length)}`);

console.debug(`Starting controller: SurrealDBController`);
const dbController = new SurrealDBController();
await dbController.exec();
console.debug(`Finished executing controller: SurrealDBController`);

