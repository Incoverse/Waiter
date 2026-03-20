import { Controller } from "@/lib/base/controller";
import express from "express";

const app = express();

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
