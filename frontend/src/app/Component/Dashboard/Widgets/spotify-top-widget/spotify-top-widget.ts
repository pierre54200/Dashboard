import { Component, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISpotifyTopItem } from "../../../../Interface/Widget/widget.interface";
import { TranslatePipe } from "../../../../I18n/translate.pipe";
import { TranslationKey } from "../../../../I18n/fr";

const PERIODS: Record<string, TranslationKey> = {
  short_term: "widget.spotify_top.period.short",
  medium_term: "widget.spotify_top.period.medium",
  long_term: "widget.spotify_top.period.long",
};

/** Titres ou artistes les plus écoutés sur une période. */
@Component({
  selector: "app-spotify-top-widget",
  imports: [TranslatePipe],
  templateUrl: "./spotify-top-widget.html",
  styleUrls: ["../widget-shared.css", "../spotify-shared.css", "./spotify-top-widget.css"],
})
export class SpotifyTopWidget extends PollingWidget<ISpotifyTopItem[]> {
  type = input<"tracks" | "artists">("tracks");
  period = input<"short_term" | "medium_term" | "long_term">("short_term");
  count = input<number>(5);

  protected override trackInputs(): void {
    this.type();
    this.period();
    this.count();
  }

  protected fetch(force: boolean) {
    const count = Math.min(20, Math.max(1, Math.round(Number(this.count()) || 5)));
    return this.api.spotifyTop(this.type(), this.period(), count, force);
  }

  periodLabel(): TranslationKey {
    return PERIODS[this.period()] ?? PERIODS["short_term"];
  }
}
