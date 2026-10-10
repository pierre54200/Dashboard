import { Component, computed, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamFriend } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";
import { TranslationKey } from "../../../../I18n/fr";


@Component({
  selector: "app-steam-friends-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./steam-friends-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-friends-widget.css"],
})
export class SteamFriendsWidget extends PollingWidget<ISteamFriend[]> {
  /** Nombre d'amis affichés (1 à 50). */
  limit = input<number>(10);
  /** all, online ou in_game */
  show = input<"all" | "online" | "in_game">("all");

  inGame = computed(() => (this.data() ?? []).filter((f) => f.game).length);
  online = computed(() => (this.data() ?? []).filter((f) => f.status !== 0).length);

  /** Message quand la liste est vide, selon le filtre. */
  emptyKey = computed<TranslationKey>(() =>
    this.show() === "in_game" ? "friends.empty.in_game" : this.show() === "online" ? "friends.empty.online" : "friends.empty",
  );

  protected override trackInputs(): void {
    this.limit();
    this.show();
  }

  protected fetch(force: boolean) {
    const limit = Math.min(50, Math.max(1, Math.round(Number(this.limit()) || 10)));
    return this.api.steamFriends(limit, this.show(), force);
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
