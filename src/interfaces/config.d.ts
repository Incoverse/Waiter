declare global {
  interface WaiterConfig {
    /** The public URL that points to this Waiter instance, used for constructing redirect URIs for authentication flows. @default "http://localhost:9999" */
    publicUrl?: string;
  }
}

export { };

