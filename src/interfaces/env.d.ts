declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * @description JWT token for SurrealDB authentication
     */
    SURREAL_JWT: string;
    /**
     * @description Active database for SurrealDB
     */
    ACTIVE_DB: string;
  }
}


