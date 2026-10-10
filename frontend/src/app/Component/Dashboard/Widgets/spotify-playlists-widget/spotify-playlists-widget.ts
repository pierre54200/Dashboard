import { Component, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISpotifyPlaylist } from "../../../../Interface/Widget/widget.interface";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

/** Playlists du compte Spotify : toutes, ou seulement celles créées par l'utilisateur. */
@Component({
  selector: "app-spotify-playlists-widget",
  imports: [TranslatePipe],
  templateUrl: "./spotify-playlists-widget.html",
  styleUrls: ["../widget-shared.css", "../spotify-shared.css", "./spotify-playlists-widget.css"],
})
export class SpotifyPlaylistsWidget extends PollingWidget<ISpotifyPlaylist[]> {
  owner = input<"all" | "mine">("all");
  count = input<number>(5);

  protected override trackInputs(): void {
    this.owner();
    this.count();
  }

  protected fetch(force: boolean) {
    const count = Math.min(20, Math.max(1, Math.round(Number(this.count()) || 5)));
    return this.api.spotifyPlaylists(this.owner(), count, force);
  }
}
