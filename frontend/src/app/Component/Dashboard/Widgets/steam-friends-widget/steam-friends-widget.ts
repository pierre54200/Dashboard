import { Component, computed } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamFriend } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";

const STATUS_LABELS: Record<number, string> = {
  0: "Hors ligne",
  1: "En ligne",
  2: "Occupé",
  3: "Absent",
  4: "Inactif",
  5: "Cherche un échange",
  6: "Cherche à jouer",
};

@Component({
  selector: "app-steam-friends-widget",
  imports: [RelativeTimePipe],
  templateUrl: "./steam-friends-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-friends-widget.css"],
})
export class SteamFriendsWidget extends PollingWidget<ISteamFriend[]> {
  inGame = computed(() => (this.data() ?? []).filter((f) => f.game).length);
  online = computed(() => (this.data() ?? []).filter((f) => f.status !== 0).length);

  protected fetch() {
    return this.api.steamFriends();
  }

  presence(f: ISteamFriend): string {
    if (f.game) return "in-game";
    switch (f.status) {
      case 0: return "offline";
      case 2: return "busy";
      case 3:
      case 4: return "away";
      default: return "online";
    }
  }

  statusLabel(f: ISteamFriend): string {
    return STATUS_LABELS[f.status] ?? "En ligne";
  }
}
