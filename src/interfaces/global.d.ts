declare global {
  /** Waiter's encryption key, this is used to encrypt sensitive data in the DB so it cannot be read by unauthorized parties */
  var encryptionKey: string;
  /** Indicates whether the application is running in compiled mode */
  var isCompiled: boolean;
  /** A map of all loaded controllers */
  var controllers: Map<string, Controller>;
  /** Waiter's configuration */
  var config: WaiterConfig;
  /** Filters content for profanity and other unwanted words */
  var contentFilter: (message: string) => string;
}

export { };

