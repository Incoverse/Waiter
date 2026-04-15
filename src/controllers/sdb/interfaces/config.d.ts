declare global {
  interface WaiterConfig {
    /** Database-specific configuration options */
    database?: {
      /** The URI of the SurrealDB server @default "wss://inimicalpart.com:13244" */
      uri?: string;
    };
  }
}


export { };

