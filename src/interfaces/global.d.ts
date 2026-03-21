import { Surreal } from "surrealdb";
import {Client} from "discord.js";
declare global {
  var db: Surreal;
  var discord: Client;
  var encryptionKey: string;
  var isCompiled: boolean;
  var controllers: Map<string, Controller>;
}

export { };

