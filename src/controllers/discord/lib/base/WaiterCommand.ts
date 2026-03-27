import * as Discord from "discord.js";
import path from "path";
export type WaiterSlashCommand =
  | Discord.SlashCommandBuilder
  | Discord.SlashCommandSubcommandsOnlyBuilder
  | Discord.SlashCommandOptionsOnlyBuilder
  | Omit<Discord.SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
  | Omit<
      Discord.SlashCommandSubcommandsOnlyBuilder,
      "addSubcommand" | "addSubcommandGroup"
    >
  | Omit<
      Discord.SlashCommandOptionsOnlyBuilder,
      "addSubcommand" | "addSubcommandGroup"
    >;
// import { WaiterSubcommand } from "./WaiterSubcommand.js";
// import { WaiterGlobal } from "@src/interfaces/global.js";
// import CacheManager from "../utilities/cacheManager.js";
// import { WaiterSubcommandGroup } from "./WaiterSubcommandGroup.js";

export abstract class WaiterCommand {
  static defaultSetupTimeoutMS = 30000;
  static defaultUnloadTimeoutMS = 30000;

  // private _subcommandHashes: Map<WaiterSubcommand, string> = new Map();
  // public _subcommands: Map<string, WaiterSubcommand> = new Map();
  private _filename: string = "";
  private _fullPath: string = "";
  public _loaded: boolean = false;
  // public cache: CacheManager = new CacheManager(new Map());
  // protected _commandSettings: WaiterEvCoSettings = {
    // devOnly: false,
    // mainOnly: false,
    // setupTimeoutMS: WaiterCommand.defaultSetupTimeoutMS,
    // unloadTimeoutMS: WaiterCommand.defaultUnloadTimeoutMS,
  // };
  protected abstract _slashCommand: WaiterSlashCommand;
  private _hash: string = ""; //! Used to detect changes during reloads
  private _fileHash: string = ""; //! Used to detect changes during reloads
  private client: Discord.Client;

  // private children: Map<string, WaiterSubcommand | WaiterSubcommandGroup> =
    // nxew Map();

  constructor(client: Discord.Client, filename?: string) {
    this.client = client;
    this._fullPath = decodeURIComponent(
      new Error().stack
        .split("\n")[2]
        .replace(/.*file:\/\//, "")
        .replace(/:[0-9]+:[0-9]+.*/g, "")
        .replace(/^\//, process.platform === "win32" ? "" : "/"),
    );
    if (filename) this._filename = filename;
    else {
      //! Find the class caller, get their filename, and set it as the filename
      this._filename = path.basename(this._fullPath);
    }
  }

    public abstract runCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any>;
    public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
        return new Promise<void>(async (res) => res(await interaction.respond([])))
    }

    public get slashCommand() {return this._slashCommand}


    public async setup(client: Discord.Client, reason: "reload"|"startup"|"duringRun"|null): Promise<boolean> {
        this._loaded = true;    
        return true;
    };


    private extendsWaiterCommand(command: any): command is typeof WaiterCommand {
      return command && command.prototype instanceof WaiterCommand;
    };
}
