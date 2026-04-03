import chalk from "chalk";
import type { ZodSchema } from "zod";

export abstract class Controller {
  public logger: Console;
  public abbr: string;
  public priority: number = 0;
  public stage: "pre" | "normal" | "post" = "normal";

  constructor(abbr: string, hex?: string) {
    this.abbr = abbr;
    this.logger = console.withSender(hex ? chalk.hex(hex)(abbr) : abbr);
  }

  public abstract exec(): Promise<void>;

  public registerConfig(): ZodSchema | void {}

  public async statuses(): Promise<void> {}
}
