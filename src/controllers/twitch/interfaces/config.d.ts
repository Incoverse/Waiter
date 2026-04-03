declare global {
  interface WaiterConfig {
    /** Twitch-specific configuration options */
    twitch?: {
      /** The endpoint for Twitch authentication */
      authEndpoint?: string;
      /** The validity duration for generated Twitch auth codes */
      generatedCodeValidity?: string;
    };
  }
}


export { };

