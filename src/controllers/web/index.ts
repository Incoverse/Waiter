import type { TemplateResponse } from "@/controllers/web/interfaces/express-template";
import { Controller } from "@/lib/base/controller";
import { findFiles } from "@/lib/misc";
import express from "express";
import { existsSync, readFileSync } from "fs";

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

app.get("/", async (req, res) => {
  const HomeTemplate = await findFiles(".", /web\/templates\/home\.html$/).then((files) => files[0]);
  res.template(HomeTemplate);
});

const registeredRoutes: { method: string; path: string; handlerStr: string }[] =
  [];

export default class WebController extends Controller {
  constructor() {
    super("HTTP");
  }

  public exec() {
    return new Promise<void>((resolve, reject) => {
      app.listen(3000, (err) => {

        if (err) {
          this.logger.error("Error starting web server:", err);
          reject(err);
          return;
        }

        this.logger.info("Web server is running on port 3000");
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


        const NotFoundTemplate = await findFiles(".", /web\/templates\/404\.html$/).then((files) => files[0]);
        res.status(404).template(NotFoundTemplate);
      })
    })
  }
}
type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";


  
export function registerRoute(method: HTTPMethod, path: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      req: express.Request,
      res: express.Response,
      ...args: any[]
    ) {
      try {
        console
          .withSender("HTTP")
          .debug(
            `Handling ${method.toUpperCase()} ${path} with ${target.constructor.name}.${propertyKey}`,
          );
        await originalMethod.apply(this, [req, res, ...args]);
      } catch (error) {
        console
          .withSender("HTTP")
          .error(`Error handling ${method.toUpperCase()} ${path}:`, error);
        res.status(500).send("Internal Server Error");
      }
    };

    app[method.toLowerCase()](path, descriptor.value);
    registeredRoutes.push({
      method: method.toUpperCase(),
      path,
      handlerStr: `${target.constructor.name}.${propertyKey}`,
    });

    return descriptor;
  };
}


export function fetchVariablesFromTemplate(templatePath: string) {

  const contents = readFileSync(templatePath, "utf-8");

  const variableRegex = /{{\s*([\w]+)\s*}}/g;
  const variables = []
  let match;
  while ((match = variableRegex.exec(contents)) !== null) {
    variables.push(match[1]);
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
    console.withSender("WEB").warn("No template path provided, returning default error page.");
    return NO_TEMPLATE_HTML
      .replaceAll("{{ title }}", "No Template Provided")
      .replaceAll("{{ message }}", "No template was provided to the renderer.");
  }

  if (!existsSync(templatePath)) {
    console.withSender("WEB").warn(`Template not found: ${templatePath}`);
    return NO_TEMPLATE_HTML
      .replaceAll("{{ title }}", "Template Not Found")
      .replaceAll("{{ message }}", "The requested template could not be found on the server.");
  }

  
  console.withSender("WEB").debug(`Rendering template: ${templatePath}`);
  let contents = readFileSync(templatePath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    contents = contents.replaceAll(regex, value.replaceAll("\n", "<br/>"));
  }

  return contents;
}