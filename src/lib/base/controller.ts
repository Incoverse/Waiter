export abstract class Controller {
  public logger: Console;
  public abbr: string;

  constructor(abbr: string) {
    this.abbr = abbr;
    this.logger = console.sender(this.abbr);
  }

  public abstract exec(): Promise<void>;
}
