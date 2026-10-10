import { Component, computed, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamAchievement, ISteamAchievements } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

/** Progression des succès d'un jeu : derniers débloqués, ou ceux qui restent. */
@Component({
  selector: "app-steam-achievements-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./steam-achievements-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-achievements-widget.css"],
})
export class SteamAchievementsWidget extends PollingWidget<ISteamAchievements> {
  /** Nom (ou morceau du nom) d'un jeu de la bibliothèque. */
  game = input<string>("");
  /** recent : derniers débloqués ; locked : restants */
  show = input<"recent" | "locked">("recent");
  /** Nombre de succès affichés (1 à 20). */
  count = input<number>(6);

  percent = computed(() => {
    const d = this.data();
    return d && d.total ? Math.round((d.unlocked / d.total) * 100) : 0;
  });

  protected override trackInputs(): void {
    this.game();
    this.show();
    this.count();
  }

  protected fetch(force: boolean) {
    const count = Math.min(20, Math.max(1, Math.round(Number(this.count()) || 6)));
    return this.api.steamAchievements(this.game().trim(), this.show(), count, force);
  }

  /** Lien vers la page des succès du jeu sur la communauté Steam. */
  statsUrl(d: ISteamAchievements): string {
    return `https://steamcommunity.com/stats/${d.app_id}/achievements`;
  }

  describe(a: ISteamAchievement): string {
    if (a.description) return a.description;
    return a.hidden ? this.i18n.t("achievements.secret") : "";
  }

  hideImage(event: Event): void {
    (event.target as HTMLElement).style.visibility = "hidden";
  }
}
