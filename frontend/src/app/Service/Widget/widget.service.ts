import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../Environments/environment";
import {
  IAvatars,
  IIntegrations,
  IIntegrationsUpdate,
  IGithubCommit,
  IGithubNotification,
  ISpotifyNowPlaying,
  ISpotifyPlaylist,
  ISpotifyTopItem,
  ISteamAchievements,
  ISteamDeal,
  ISteamMonthlyPlaytime,
  ISteamFriend,
  ISteamUpdate,
  IWeather,
} from "../../Interface/Widget/widget.interface";

@Injectable({ providedIn: "root" })
export class WidgetService {
  private readonly widgetsUrl = `${environment.apiUrl}widgets/`;
  private readonly settingsUrl = `${environment.apiUrl}users/me/widgets`;
  private readonly integrationsUrl = `${environment.apiUrl}users/me/integrations`;

  constructor(private http: HttpClient) {}

  /**
   * GET sur une route de widget.
   * `force` (bouton Actualiser) ajoute ?refresh=1 pour que Django ignore son cache.
   */
  private widget<T>(path: string, values: Record<string, string | number | undefined>, force: boolean): Observable<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== "") params = params.set(key, value);
    }
    if (force) params = params.set("refresh", 1);
    return this.http.get<T>(this.widgetsUrl + path, { params });
  }

  weather(city?: string, force = false): Observable<IWeather> {
    return this.widget<IWeather>("weather", { city }, force);
  }

  /** `show` : all, online ou in_game. */
  steamFriends(limit?: number, show?: string, force = false): Observable<ISteamFriend[]> {
    return this.widget<ISteamFriend[]>("steam/friends", { limit, show }, force);
  }

  /** `game` vide : la dernière annonce de chaque jeu joué récemment. */
  steamUpdates(count?: number, game?: string, force = false): Observable<ISteamUpdate[]> {
    return this.widget<ISteamUpdate[]>("steam/updates", { count, game }, force);
  }

  steamMonthlyPlaytime(count?: number, force = false): Observable<ISteamMonthlyPlaytime> {
    return this.widget<ISteamMonthlyPlaytime>("steam/monthly-playtime", { count }, force);
  }

  /** `show` : recent (derniers débloqués) ou locked (restants). */
  steamAchievements(game: string, show?: string, count?: number, force = false): Observable<ISteamAchievements> {
    return this.widget<ISteamAchievements>("steam/achievements", { game, show, count }, force);
  }

  /** `games` vide : les meilleures promos du moment. `country` fixe la devise. */
  steamDeals(games?: string, country?: string, count?: number, force = false): Observable<ISteamDeal[]> {
    return this.widget<ISteamDeal[]>("steam/deals", { games, country, count }, force);
  }

  /** `history` : nombre de morceaux écoutés juste avant (0 à 10). */
  spotifyNowPlaying(history?: number, force = false): Observable<ISpotifyNowPlaying> {
    return this.widget<ISpotifyNowPlaying>("spotify/now-playing", { history }, force);
  }

  /** `type` : tracks ou artists ; `period` : short_term, medium_term ou long_term. */
  spotifyTop(type?: string, period?: string, count?: number, force = false): Observable<ISpotifyTopItem[]> {
    return this.widget<ISpotifyTopItem[]>("spotify/top", { type, period, count }, force);
  }

  /** `owner` : all ou mine (seulement celles que tu as créées). */
  spotifyPlaylists(owner?: string, count?: number, force = false): Observable<ISpotifyPlaylist[]> {
    return this.widget<ISpotifyPlaylist[]>("spotify/playlists", { owner, count }, force);
  }

  /**
   * Liaison du compte Spotify : navigation complète vers Django, qui redirige vers Spotify,
   * puis revient sur Paramètres > Services.
   */
  spotifyConnect(): void {
    window.location.href = `${environment.apiUrl}services/spotify/connect`;
  }

  /** « Se connecter via Steam » : la fenêtre Steam renvoie un Steam ID vérifié. */
  steamConnect(): void {
    window.location.href = `${environment.apiUrl}services/steam/connect`;
  }

  /** Connexion GitHub depuis Paramètres > Services : le token obtenu sert aux widgets. */
  githubConnect(): void {
    window.location.href = `${environment.apiUrl}auth/github/login?mode=link&from=services`;
  }

  spotifyUnlink(): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}services/spotify`);
  }

  /** Photos de profil Steam et GitHub pour l'en-tête des cartes. */
  avatars(): Observable<IAvatars> {
    return this.http.get<IAvatars>(this.widgetsUrl + "avatars");
  }

  githubCommits(repo: string, count?: number, force = false): Observable<IGithubCommit[]> {
    return this.widget<IGithubCommit[]>("github/commits", { repo, count }, force);
  }

  /** `filter` : unread, all ou participating. */
  githubNotifications(count?: number, filter?: string, force = false): Observable<IGithubNotification[]> {
    return this.widget<IGithubNotification[]>("github/notifications", { count, filter }, force);
  }


  getIntegrations(): Observable<IIntegrations> {
    return this.http.get<IIntegrations>(this.integrationsUrl);
  }

  updateIntegrations(changes: IIntegrationsUpdate): Observable<IIntegrations> {
    return this.http.patch<IIntegrations>(this.integrationsUrl, changes);
  }


  loadSettings(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(this.settingsUrl);
  }

  saveSettings(settings: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(this.settingsUrl, settings);
  }
}
