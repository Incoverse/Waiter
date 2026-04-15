declare global {
  interface WaiterConfig {
    /** Twitch-specific configuration options */
    twitch?: {
      /** The endpoint for Twitch authentication */
      authEndpoint?: string;
      /** The validity duration for generated Twitch auth codes */
      generatedCodeValidity?: string;

      /** Twitch bot configurations */
      bot?: {
        /** Whether or not to show the Chat Bot badge for Twitch messages sent by Waiter on it's account. */
        showBotBadge?: boolean;
      }
    };
  }
}


export { };

