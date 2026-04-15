declare global {
  interface WaiterConfig {
    /** Twitch-specific configuration options */
    twitch?: {
      /** The endpoint for Twitch authentication @default "/twitch/auth" */
      authEndpoint?: string;
      /** The validity duration for generated Twitch auth codes @default "15m" */
      generatedCodeValidity?: string;

      /** Twitch bot configurations */
      bot?: {
        /** Whether or not to show the Chat Bot badge for Twitch messages sent by Waiter on it's account. @default true */
        showBotBadge?: boolean;
      }
    };
  }
}


export { };

