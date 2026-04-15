performance.mark("app_start");
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
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { IEM } from "./lib/iem";

import chalk from "chalk";
import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  keepEndCensorStrategy,
  keepStartCensorStrategy
} from "obscenity";
import prettyMilliseconds from "pretty-ms";
import { fileURLToPath } from "url";
import z, { ZodObject } from "zod";
import { Controller } from "./lib/base/controller";
import { deepMergeSchemas, extendsClass, findFiles, importLocalModule, type DeepRequired } from "./lib/misc";
const __filename = fileURLToPath(import.meta.url);

global.controllers = new Map();
global.isCompiled = path.extname(__filename) === ".js";

const waiterInfo = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf-8"),
)
const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});
const censor = new TextCensor();
censor.setStrategy(keepStartCensorStrategy(keepEndCensorStrategy(asteriskCensorStrategy())));

global.contentFilter = (message: string) => {
  const matches = matcher.getAllMatches(message);

  return censor.applyTo(message, matches);    
}

process.on("warning", (warning) => {
  if (warning.name == "TimeoutOverflowWarning") return; // Ignore TimeoutOverflowWarning (from SurrealDB)

  console.warn(warning);
});

dotenv.config({ quiet: true });

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


const controllers: Controller[] = (await Promise.all(findFiles(global.isCompiled ? "dist" : "src", /controllers\/.*?\/index\..s$/).map(importLocalModule)))
  .map((mod) => mod.default)
  .filter((cls) => !!cls)
  .filter((cls) => extendsClass(cls, Controller))
  .map((ControllerClass) => new ControllerClass())
  .toSorted((a: Controller, b: Controller) => {
    if (a.stage === "pre" && b.stage !== "pre") return -1;
    if (a.stage !== "pre" && b.stage === "pre") return 1;

    if (a.stage === "post" && b.stage !== "post") return 1;
    if (a.stage !== "post" && b.stage === "post") return -1;

    return a.priority - b.priority;
  })
  

console.debug(`Found ${controllers.length} controller(s):`);
for (const controller of controllers) {
  console.debug(`  - ${controller.constructor.name} (${controller.abbr}), stage: ${controller.stage}, priority: ${controller.priority}`);
}


let configSchema = z.object({
  publicUrl: z.url().default("http://localhost:9999")
    .describe("The public URL for the application, used for OAuth callbacks and shortened URLs. Must be a valid URL."),
});

for (const controller of controllers) {
  const schema = controller.registerConfig();
  if (schema && schema instanceof ZodObject) {
    configSchema = deepMergeSchemas(configSchema, schema);
  }
}

configSchema = configSchema.default({ publicUrl: "http://localhost:9999" }) as any;



let configFile = findFiles(global.isCompiled ? "dist" : "src", /\/config\..s$/)?.shift();

if (!configFile) {
  let defaultConfigPath = findFiles(global.isCompiled ? "dist" : "src", /\/default\.config\..s$/)?.shift();
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
  .catch(() => {
    return "IMPORT_ERROR"
  });

if (config == "IMPORT_ERROR") {
  console.fatal("An error occurred while importing the config file. Please make sure it is valid and does not contain any syntax errors.");
  process.exit(1);
}

const parseResult = configSchema.safeParse(config);

if (!parseResult.success) {
  console.log();
  console.fatal("Config file failed validation. Please fix the following issues in your config file:");
  for (const issue of parseResult.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1)
}


global.config = parseResult.data as unknown as DeepRequired<WaiterConfig>



const preControllers = controllers.filter(c => c.stage === "pre");
const normalControllers = controllers.filter(c => c.stage === "normal");
const postControllers = controllers.filter(c => c.stage === "post");

for (const controller of controllers) {
  global.controllers.set(controller.abbr, controller);
}

async function runController(controller: Controller) {
  const controllerName = controller.constructor.name;
  console.debug(`Starting controller: ${controllerName} (${controller.abbr})`);
  let failed = false;
  try {
    performance.mark(`${controllerName}_start`);
    await controller.exec();
  } catch (err) {
    console.error(`Error starting controller ${controllerName} (${controller.abbr}):`, err);
    failed = true;
  }
  performance.mark(`${controllerName}_end`);
  const duration = performance.measure(`${controllerName}_duration`, `${controllerName}_start`, `${controllerName}_end`).duration;
  if (failed) {
    console.error(`Controller ${controllerName} (${controller.abbr}) failed to start after ${chalk.redBright.bold(prettyMilliseconds(duration))}.`);
  } else {
    console.debug(`Controller ${controllerName} (${controller.abbr}) started successfully in ${chalk.greenBright.bold(prettyMilliseconds(duration))}.`);
  }

}

await Promise.all(preControllers.map(runController));
await Promise.all(normalControllers.map(runController));
await Promise.all(postControllers.map(runController));

console.perfect("All controllers started.");
performance.mark("app_ready");


const s2r = performance.measure("start_to_ready", "app_start", "app_ready");

console.debug("---------------------------------")
console.debug(`Startup times:`);
console.debug(`  - Waiter: ${chalk.cyanBright.bold(prettyMilliseconds(s2r.duration))}`);
for (const controller of controllers) {
  const startMark = `${controller.constructor.name}_start`;
  const endMark = `${controller.constructor.name}_end`;
  const measureName = `${controller.constructor.name}_duration`;
  const duration = performance.measure(measureName, startMark, endMark).duration;
  const stagePrefix = controller.stage === "normal" ? "norm" : controller.stage.padEnd(4, " ");
  console.debug(`    - [${stagePrefix}] ${controller.constructor.name} (${controller.abbr}): ${chalk.cyanBright.bold(prettyMilliseconds(duration))}`);
}
console.log("---------------------------------")
console.info("Waiter", chalk.cyanBright(`v${waiterInfo.version}`), "is up and running!");
console.log()

for (const controller of controllers) {
  await controller.statuses();
}

console.log("---------------------------------")