import type { Server } from "socket.io";
import { Socket } from "socket.io";
import type ManagerController from "..";
import type ManagerClient from "../client";

type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONArray = JSONValue[];
export type JSONObject = { [key: string]: JSONValue };

export type WaiterSocket = Omit<Socket, "emit"> & {
  emit(eventName: string, data: JSONObject, requestId?: string): boolean;
};

declare global {
  var manager: {
    /** The Manager controller instance. */
    controller: ManagerController;
    /** Gets the set of connected manager clients. */
    clients: Set<ManagerClient>;
    /** The Socket.IO server instance used by the manager controller. */
    io: Server;
    /** Communication system for sending messages between the manager controller and other parts of the application. */
    communication: Communication;
  };
}

export { };

