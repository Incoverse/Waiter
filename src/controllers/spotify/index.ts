import { Controller } from "@/lib/base/controller";
export default class SpotifyController extends Controller {
  constructor() {
    super("SPOT", "#1DB954");
  }

  public async exec() {
    this.logger.warn("Spotify integration is not implemented yet.");
  }

  public override async statuses(): Promise<void> {
    this.logger.log("Spotify integration is not implemented yet.");
  }
}
