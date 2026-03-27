declare global {
  interface WaiterConfig {
    /** Database-specific configuration options */
    database?: {
      /** The URI of the SurrealDB server */
      uri?: string;
    };
  }
}


export { };

