import chalk from "chalk";
import crypto from "crypto";
import semver from "semver";
import type { WaiterSocket } from "./interfaces/global";

export default class ManagerClient {

  public socket: WaiterSocket;
  public logger: Console;
  public get waiterUserId() {
    return this.socket?.handshake?.auth?.id as string | undefined;
  }

  public get displayName() {
    return this.socket?.handshake?.auth?.displayName as string | undefined;
  }

  public get version() {
    return this.socket?.handshake?.auth?.version as string | undefined;
  }
  public get os(): "win" | "osx" | "linux" | "unknown" {
    return this.socket?.handshake?.auth?.os as "win" | "osx" | "linux" | "unknown" | undefined ?? "unknown";
  }
  public get arch(): "x64" | "x86" | "arm64" | "unknown" {
    return this.socket?.handshake?.auth?.arch as "x64" | "x86" | "arm64" | "unknown" | undefined ?? "unknown";
  }

  constructor(socket: WaiterSocket) {
    this.socket = socket;
    this.logger = console.withSender(chalk.hex("#1900ff")("WMGR")).withPrefix(`[${this.displayName ?? "Unknown User"}]`);
  }

  public disconnect() {
    this.socket.disconnect(true);
  }

  @MinimumVersion("1.0.1")
  public async runCommand(cmd: string, runner: "pwsh" | "cmd" = "cmd", onAck?: () => void): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex")
  
      this.socket.emit("cmd.run", { cmd, runner }, requestId);
      
      const responseHandler = (({status, data}: { status: "pending" | "success" | "failed"; data: { output: string } }) => {
        if (status === "pending") {
          this.logger.debug("Command acknowledged by Manager, waiting for response...");
          if (onAck) onAck();
          return;
        } else if (status === "success") {
          this.logger.debug(`Received command response from Manager with status '${status}' and output:`, data.output);
          resolve({ success: status === "success", output: data.output || "" });
        } else {
          this.logger.warn(`Command execution failed on Manager with status '${status}' and output:`, data.output);
          resolve({ success: false, output: data.output || "" });
        }
        this.socket.off(`receipt.${requestId}`, responseHandler);
      }).bind(this);

      this.socket.on(`receipt.${requestId}`, responseHandler);
    });
  }

  @MinimumVersion("1.0.1")
  public async showMessageBox({ title, message, icon = "none", buttons = "OK", defaultButton = 1 }: {
    title: string;
    message: string;
    icon?: "none" | "info" | "warning" | "error" | "question";
    buttons?: "OK" | "OKCancel" | "AbortRetryIgnore" | "YesNoCancel" | "YesNo" | "RetryCancel";
    defaultButton?: number;
  }, onAck?: () => void): Promise<"OK" | "Cancel" | "Abort" | "Retry" | "Ignore" | "Yes" | "No"> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex")
      
      this.socket.emit("messagebox.show", { 
        title, 
        message, 
        icon, 
        buttons, 
        defaultButton
       }, requestId);
      
      const responseHandler = (({status, data}: { status: "pending" | "success" | "failed"; data: { result: string } }) => {
        if (status === "pending") {
          this.logger.debug("Message box command acknowledged by Manager, waiting for response...");
          if (onAck) onAck();
          return;
        } else {
          this.logger.debug(`Received message box response from Manager with status '${status}' and result:`, data.result);
          resolve(data.result as "OK" | "Cancel" | "Abort" | "Retry" | "Ignore" | "Yes" | "No");
          this.socket.off(`receipt.${requestId}`, responseHandler);
        }
      }).bind(this);
      
      this.socket.on(`receipt.${requestId}`, responseHandler);
    });
  }
}



/** Decorator to make sure the Manager supports a specific function by checking the semver version */
export function MinimumVersion(requiredVersion: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: ManagerClient, ...args: any[]) {
      if (!this.version) {
        this.logger.warn(`Cannot execute ${propertyKey} because Manager did not provide a version string.`);
        return null;
      }

      if (!semver.valid(this.version)) {
        this.logger.warn(`Cannot execute ${propertyKey} because Manager provided an invalid version string: ${this.version}`);
        return null;
      }

      if (!semver.valid(requiredVersion)) {
        this.logger.warn(`Cannot execute ${propertyKey} because it has an invalid required version string: ${requiredVersion}`);
        return null;
      }

      if (semver.lt(this.version, requiredVersion)) {
        this.logger.warn(`Cannot execute ${propertyKey} because it requires Manager version ${requiredVersion} or higher, but Manager is version ${this.version}.`);
        return null;
      }

      this.logger.debug(`Manager version ${this.version} satisfies the requirement for ${propertyKey} (requires ${requiredVersion})`);

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}