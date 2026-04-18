import type { DeepRequired } from "@/lib/misc";

declare global {
  /** Waiter's encryption key, this is used to encrypt sensitive data in the DB so it cannot be read by unauthorized parties */
  var encryptionKey: string;
  /** Indicates whether the application is running in compiled mode */
  var isCompiled: boolean;
  /** A map of all loaded controllers */
  var controllers: Map<string, Controller>;
  /** Waiter's configuration */
  var config: DeepRequired<WaiterConfig>;
  /** Filters content for profanity and other unwanted words */
  var contentFilter: (message: string) => string;

  /** The machine's unique identifier. Used to make sure 2 instances don't start acting on the same database */
  var machineId: string;
}

export { };

