declare global {
  interface WaiterConfig {
    /** Spotify-specific configuration options */
    spotify?: {
      /** The endpoint for Spotify authentication */
      authEndpoint?: string;
    };
  }
}


export { };

