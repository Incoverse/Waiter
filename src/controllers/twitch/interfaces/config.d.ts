declare global {
  interface WaiterConfig {
    /** Twitch-specific configuration options */
    twitch?: {
      /** The endpoint for Twitch authentication */
      authEndpoint?: string;
    };
  }
}


export { };

