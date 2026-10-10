import { Component, DestroyRef, computed, effect, inject, input, signal } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISpotifyNowPlaying } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

/** Morceau en cours sur Spotify, et ceux écoutés juste avant. */
@Component({
  selector: "app-spotify-now-playing-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./spotify-now-playing-widget.html",
  styleUrls: ["../widget-shared.css", "../spotify-shared.css", "./spotify-now-playing-widget.css"],
})
export class SpotifyNowPlayingWidget extends PollingWidget<ISpotifyNowPlaying> {
  /** Nombre de morceaux écoutés juste avant (0 à 10). */
  history = input<number>(3);

  /** La barre de progression avance chaque seconde entre deux actualisations. */
  private now = signal(Date.now());
  private receivedAt = signal(Date.now());

  progress = computed(() => {
    const p = this.data()?.playing;
    if (!p || p.progress_ms === null || !p.duration_ms) return null;
    const elapsed = p.is_playing ? this.now() - this.receivedAt() : 0;
    const ms = Math.min(p.duration_ms, p.progress_ms + elapsed);
    return { ms, percent: (ms / p.duration_ms) * 100 };
  });

  constructor() {
    super();
    effect(() => {
      this.data();
      this.receivedAt.set(Date.now());
    });
    const id = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected override trackInputs(): void {
    this.history();
  }

  protected fetch(force: boolean) {
    const history = Math.min(10, Math.max(0, Math.round(Number(this.history()) || 0)));
    return this.api.spotifyNowPlaying(history, force);
  }

  /** 215000 ms vers « 3:35 ». */
  time(ms: number | null): string {
    if (ms === null) return "";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
}
