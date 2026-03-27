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
import de from "dotenv";
import fs from "fs/promises";
import path from "path";
import { IEM } from "./lib/iem";

import chalk from "chalk";
import { fileURLToPath } from "url";
import z, { ZodObject, type ZodRawShape } from "zod";
import { Controller } from "./lib/base/controller";
import { deepMergeSchemas, extendsClass, findFiles, importLocalModule } from "./lib/misc";
const __filename = fileURLToPath(import.meta.url);

global.controllers = new Map();
global.isCompiled = path.extname(__filename) === ".js";

const waiterInfo = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf-8"),
);



process.on("warning", (warning) => {
  if (warning.name == "TimeoutOverflowWarning") return; // Ignore TimeoutOverflowWarning (from SurrealDB)

  console.warn(warning);
});

de.config({ quiet: true });

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


const controllers: Controller[] = (await Promise.all(findFiles(".", /controllers\/.*?\/index\..s$/).map(importLocalModule)))
  .map((mod) => mod.default)
  .filter((cls) => !!cls)
  .filter((cls) => extendsClass(cls, Controller))
  .map((ControllerClass) => new ControllerClass())
  .toSorted((a: Controller, b: Controller) => {
    if (a.stage === "pre" && b.stage !== "pre") return -1;
    if (a.stage !== "pre" && b.stage === "pre") return 1;
    return a.priority - b.priority;
  })
  

console.debug(`Found ${controllers.length} controller(s):`);
for (const controller of controllers) {
  console.debug(`  - ${controller.constructor.name} (${controller.abbr}), stage: ${controller.stage}, priority: ${controller.priority}`);
}


let configSchema: ZodObject<ZodRawShape> = z.object({});

for (const controller of controllers) {
  const schema = controller.registerConfig();
  if (schema && schema instanceof ZodObject) {
    configSchema = deepMergeSchemas(configSchema, schema);
  }
}



let configFile = findFiles(".", /(src|dist)\/config\..s$/)?.shift();

if (!configFile) {
  let defaultConfigPath = findFiles(".", /(src|dist)\/default\.config\..s$/)?.shift();
  if (!defaultConfigPath) {
    console.fatal("No config file was found. We tried to make one using the default config template, but it seems like that template is missing as well. Please copy over the default config template from the repository and restart the application.");
    process.exit(1);
  }


  const newPath = defaultConfigPath.replace(/default\.config\.(.)s$/, "config.$1s");
  await fs.copyFile(defaultConfigPath, newPath);

  console.log()
  console.warn(`No config file found. A new one has been created at ${chalk.bold(newPath)}.`)
  console.warn(`Please edit this file with your configuration and restart the application.`);
  process.exit(0);
}

const config = await importLocalModule(configFile)
  .then((mod) => mod.default)
  .catch(() => ({}));

const parseResult = configSchema.safeParse(config);

if (!parseResult.success) {
  console.log();
  console.fatal("Config file failed validation. Please fix the following issues in your config file:");
  for (const issue of parseResult.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1)
}


global.config = parseResult.data as unknown as WaiterConfig



const preControllers = controllers.filter(c => c.stage === "pre");
const normalControllers = controllers.filter(c => c.stage === "normal");


for (const controller of controllers) {
  global.controllers.set(controller.abbr, controller);
}

async function runController(controller: Controller) {
  const controllerName = controller.constructor.name;
  console.debug(`Starting controller: ${controllerName} (${controller.abbr})`);
  try {
    await controller.exec();
    console.debug(`Controller ${controllerName} (${controller.abbr}) started successfully.`);
  } catch (err) {
    console.error(`Error starting controller ${controllerName} (${controller.abbr}):`, err);
  }
}

await Promise.all(preControllers.map(runController));
await Promise.all(normalControllers.map(runController));
    

console.perfect("All controllers started.");


console.log("---------------------------------")
console.info("Waiter", chalk.cyanBright(`v${waiterInfo.version}`), "is up and running!");
console.log()

for (const controller of controllers) {
  await controller.statuses();
}

console.log("---------------------------------")