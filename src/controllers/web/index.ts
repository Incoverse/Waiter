import { Controller } from "@/lib/base/controller";
import CacheManager from "@/lib/cache";
import { findFiles } from "@/lib/misc";
import type { TemplateResponse } from "@web/interfaces/express-template";
import chalk from "chalk";
import crypto from "crypto";
import express from "express";
import { existsSync, readFileSync } from "fs";
import { z, type ZodType } from "zod";

const app = express();

// Middleware to add res.template
app.use((req, res, next) => {
  (res as TemplateResponse).template = function(templatePath: string, variables: Record<string, string> = {}) {
    const html = renderTemplate(templatePath, variables);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  };
  next();
});

const registeredRoutes: { method: string; path: string; handlerStr: string }[] = [];
const shortenCache = new CacheManager({
  name: "ShortenCache",
});


const toRegister: {
  call: () => string,
  method: HTTPMethod,
  handler: any,
  handlerStr: string,
}[] = [];

export default class WebController extends Controller {
  public override priority: number = Number.MIN_SAFE_INTEGER + 1; //? Ensure this controller loads after the database controller, but before all other controllers that might want to register routes.
  constructor() {
    super("HTTP", "#009f9f");
  }

  @registerRoute("GET", "/")
  protected HomeRouteHandler(req: express.Request, res: express.Response) {
    const HomeTemplate = findFiles(global.isCompiled ? "dist" : "src", /web[\\/]templates[\\/]home\.html$/)?.shift();
    res.template(HomeTemplate);
  }

  @registerRoute("GET", "/s/:id")
  protected ShortenerRouteHandler(req: express.Request, res: express.Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      res.status(400).send("Bad Request: No ID provided.");
      return;
    }

    const url = shortenCache.get(id);
    if (url) {
      res.redirect(url);
    }
    else {
      res.status(404).send("Shortened URL not found or expired.");
    }
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      web: z.object({
        port: z.number()
          .describe("The port on which the web server will run")
          .default(9999)
          .refine((port: number) => port > 0 && port < 65536, "Port must be between 1 and 65535"),
      }).default({ port: 9999 }),
    }) satisfies z.ZodType<Pick<WaiterConfig, "web">>;
  }

  public exec() {
    return new Promise<void>((resolve, reject) => {

      for (const route of toRegister) {
        const path = route.call();
        app[route.method.toLowerCase()](path, route.handler);
        registeredRoutes.push({
          method: route.method.toUpperCase(),
          path,
          handlerStr: route.handlerStr,
        });
      } 

      app.listen(global.config.web.port, (err) => {
        if (err) {
          this.logger.error("Error starting web server:", err);
          reject(err);
          return;
        }

        this.logger.info(`Web server is listening on *:${global.config.web.port}`);
        resolve();
      });

      this.logger.debug("Registered routes:");
      for (const route of registeredRoutes) {
        this.logger.debug(
          `  - ${route.method} ${route.path} -> ${route.handlerStr}`,
        );
      }

      app.use(async (req, res) => {
        this.logger.warn(`No route found for ${req.method} ${req.path}`);

        const NotFoundTemplate = findFiles(global.isCompiled ? "dist" : "src", /web[\\/]templates[\\/]404\.html$/)?.shift();
        res.status(404).template(NotFoundTemplate);
      })
    })
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Web server listening on: ${chalk.yellow(`*:${global.config.web.port}`)}`);
    const methodColors = {
      GET: chalk.green,
      POST: chalk.blue,
      PUT: chalk.yellow,
      DELETE: chalk.red,
      PATCH: chalk.cyan,
      OPTIONS: chalk.magenta,
      HEAD: chalk.gray,
    }
    this.logger.log(`Registered routes:`);
    for (const route of registeredRoutes) {
      this.logger.log(
        `  - ${methodColors[route.method](route.method)} ${route.path} ${chalk.dim(`-> ${route.handlerStr}`)}`,
      );
    }
  }
}



export function shorten(url: string): string {
  let id = crypto.randomBytes(6).toString("hex");
  while (shortenCache.has(id)) {
    id = crypto.randomBytes(6).toString("hex");
  }
  shortenCache.set(id, url, Date.now() + 1000 * 60 * 60 * 24); // Cache for 24 hours
  return `${global.config.publicUrl}/s/${id}`;
}

type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";


export function registerRoute(method: HTTPMethod, path: string | (()=>string)) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
      ...args: any[]
    ) {
      try {
        console
          .withSender(chalk.hex("009f9f")("HTTP"))
          .debug(
            `Handling ${method.toUpperCase()} ${req.path} with ${target.name ?? target.constructor.name}#${propertyKey}()`,
          );
        await originalMethod.apply(this, [req, res, next, ...args]);
      } catch (error) {
        console
          .withSender(chalk.hex("009f9f")("HTTP"))
          .error(`Error handling ${method.toUpperCase()} ${req.path}:`, error);
        res.status(500).send("Internal Server Error");
      }
    };

    if (typeof path === "function") {
      toRegister.push({
        call: path,
        method,
        handler: descriptor.value,
        handlerStr: `${target.name ?? target.constructor.name}#${propertyKey}()`,
      });
    } else {
      app[method.toLowerCase()](path, descriptor.value);
      registeredRoutes.push({
        method: method.toUpperCase(),
        path,
        handlerStr: `${target.name ?? target.constructor.name}#${propertyKey}()`,
      });
    }

    return descriptor;
  };
}


export function fetchVariablesFromTemplate(templatePath: string) {

  const contents = readFileSync(templatePath, "utf-8");

  const variableRegex = /{{\s*(?<variable>[\w]+)\s*}}/g;
  const variables: string[] = [];
  let match;
  while ((match = variableRegex.exec(contents)) !== null) {
    variables.push(match.groups.variable);
  }

  return variables;
}

const NO_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f8d7da;
      color: #721c24;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      background-color: #f5c6cb;
      padding: 20px 40px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    h1 {
      margin-top: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{ title }}</h1>
    <p>{{ message }}</p>
  </div>
</body>
</html>`;

export function renderTemplate(templatePath: string, variables: Record<string, string> = {}) {

  if (!templatePath || !templatePath.trim()) {
    console.withSender(chalk.hex("009f9f")("HTTP")).warn("No template path provided, returning default error page.");
    return NO_TEMPLATE_HTML
      .replaceAll("{{ title }}", "No Template Provided")
      .replaceAll("{{ message }}", "No template was provided to the renderer.");
  }

  if (!existsSync(templatePath)) {
    console.withSender(chalk.hex("009f9f")("HTTP")).warn(`Template not found: ${templatePath}`);
    return NO_TEMPLATE_HTML
      .replaceAll("{{ title }}", "Template Not Found")
      .replaceAll("{{ message }}", "The requested template could not be found on the server.");
  }

  
  console.withSender(chalk.hex("009f9f")("HTTP")).debug(`Rendering template: ${templatePath}`);
  let contents = readFileSync(templatePath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    contents = contents.replaceAll(regex, value.replaceAll("\n", "<br/>"));
  }

  return contents;
}