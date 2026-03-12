declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * @description JWT token for SurrealDB authentication
     */
    SURREAL_JWT: string;
    /**
     * @description Salt used for encrypting notes
     */
    NOTE_SALT: string;
  }
}
