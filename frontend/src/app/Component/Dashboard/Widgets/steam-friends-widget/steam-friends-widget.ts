import { Component, computed } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamFriend } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";


@Component({
  selector: "app-steam-friends-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./steam-friends-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-friends-widget.css"],
})
export class SteamFriendsWidget extends PollingWidget<ISteamFriend[]> {
  inGame = computed(() => (this.data() ?? []).filter((f) => f.game).length);
  online = computed(() => (this.data() ?? []).filter((f) => f.status !== 0).length);

  protected fetch(force: boolean) {
    return this.api.steamFriends(force);
  }

  /** Couleur de la pastille, comme les statuts Discord. */
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
    const key = `friends.status.${f.status}`;
    return this.i18n.has(key) ? this.i18n.t(key as never) : this.i18n.t("friends.status.1");
  }
}
