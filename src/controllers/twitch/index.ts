import { Controller } from "@/lib/base/controller";
import TwitchClient from "./client";

export default class TwitchController extends Controller {
  constructor() {
    super("TWCH");
  }

  private client: TwitchClient;

  public async exec() {
    await TwitchClient.create();
  }
}
