declare global {
  interface WaiterConfig {
    /** Database-specific configuration options */
    database?: {
      /** The URI of the SurrealDB server @default "wss://inimicalpart.com:13244" */
      uri?: string;
      /** Active database for SurrealDB. Uses the logged in user's username + '-test'. This should be changed to "main" when running production @default `${username}-test` */
      db?: string;
    };
  }
}


export { };

