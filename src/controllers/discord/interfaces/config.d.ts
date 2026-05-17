declare global {
  interface WaiterConfig {
    /** Discord-specific configuration options */
    discord: {
      /** The ID of the Discord server to register commands for, as well as the server Waiter will be focused on */
      serverId: string;
    };
  }
}


export { };

