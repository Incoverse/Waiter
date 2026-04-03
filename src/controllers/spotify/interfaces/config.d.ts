declare global {
  interface WaiterConfig {
    /** Spotify-specific configuration options */
    spotify?: {
      /** The endpoint for Spotify authentication */
      authEndpoint?: string;
      /** The validity duration for generated Spotify auth codes */
      generatedCodeValidity?: string;
    };
  }
}


export { };

