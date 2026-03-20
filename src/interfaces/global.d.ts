import { Surreal } from "surrealdb";

declare global {
  var db: Surreal;
  var encryptionKey: string;
  var isCompiled: boolean;
  var controllers: Map<string, Controller>;
}

export { };

