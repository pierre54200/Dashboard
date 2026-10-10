import { Component, computed, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamMonthlyGame, ISteamMonthlyPlaytime } from "../../../../Interface/Widget/widget.interface";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

@Component({
  selector: "app-steam-playtime-widget",
  imports: [TranslatePipe],
  templateUrl: "./steam-playtime-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-playtime-widget.css"],
})
export class SteamPlaytimeWidget extends PollingWidget<ISteamMonthlyPlaytime> {
  count = input<number>(3);

  monthLabel = computed(() => {
    const month = this.data()?.month;
    if (!month) return "";
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(this.i18n.locale(), { month: "long", year: "numeric" });
  });

  partial = computed(() => {
    const d = this.data();
    return !!d && d.tracked_since.slice(0, 7) === d.month && !d.tracked_since.endsWith("-01");
  });

  private max = computed(() => Math.max(1, ...(this.data()?.games ?? []).map((g) => g.minutes_this_month)));

  protected override trackInputs(): void {
    this.count();
  }

  protected fetch(force: boolean) {
    return this.api.steamMonthlyPlaytime(this.clampedCount(), force);
  }

  private clampedCount(): number {
    return Math.min(10, Math.max(1, Math.round(Number(this.count()) || 3)));
  }

  share(g: ISteamMonthlyGame): number {
    return Math.max(4, Math.round((g.minutes_this_month / this.max()) * 100));
  }

  duration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return this.i18n.t("time.minutes", { m });
    return m ? this.i18n.t("time.hours_minutes", { h, m: String(m).padStart(2, "0") }) : this.i18n.t("time.hours", { h });
  }

  hideImage(event: Event): void {
    (event.target as HTMLElement).style.visibility = "hidden";
  }
}
