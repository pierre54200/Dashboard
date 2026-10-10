import { Component } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamUpdate } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";

@Component({
  selector: "app-steam-updates-widget",
  imports: [RelativeTimePipe],
  templateUrl: "./steam-updates-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-updates-widget.css"],
})
export class SteamUpdatesWidget extends PollingWidget<ISteamUpdate[]> {
  protected fetch() {
    return this.api.steamUpdates();
  }

  /** Les annonces Steam contiennent du BBCode et des liens bruts : on garde le texte. */
  clean(summary: string | null): string {
    return (summary ?? "")
      .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, "")
      .replace(/\[\/?[^\]]+\]/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  hideImage(event: Event): void {
    (event.target as HTMLElement).style.visibility = "hidden";
  }
}
