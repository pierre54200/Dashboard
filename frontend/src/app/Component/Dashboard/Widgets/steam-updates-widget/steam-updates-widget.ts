import { Component, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamUpdate } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

@Component({
  selector: "app-steam-updates-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./steam-updates-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-updates-widget.css"],
})
export class SteamUpdatesWidget extends PollingWidget<ISteamUpdate[]> {
  /** Nombre d'annonces (1 à 10). */
  count = input<number>(5);
  /** Nom (ou morceau du nom) d'un jeu de la bibliothèque ; vide = jeux joués récemment. */
  game = input<string>("");

  protected override trackInputs(): void {
    this.count();
    this.game();
  }

  protected fetch(force: boolean) {
    const count = Math.min(10, Math.max(1, Math.round(Number(this.count()) || 5)));
    return this.api.steamUpdates(count, this.game().trim(), force);
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
