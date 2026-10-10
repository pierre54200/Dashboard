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

  steamFriends(force = false): Observable<ISteamFriend[]> {
    return this.widget<ISteamFriend[]>("steam/friends", {}, force);
  }

  steamUpdates(force = false): Observable<ISteamUpdate[]> {
    return this.widget<ISteamUpdate[]>("steam/updates", {}, force);
  }

  steamMonthlyPlaytime(count?: number, force = false): Observable<ISteamMonthlyPlaytime> {
    return this.widget<ISteamMonthlyPlaytime>("steam/monthly-playtime", { count }, force);
  }

  /** Photos de profil Steam et GitHub pour l'en-tête des cartes. */
  avatars(): Observable<IAvatars> {
    return this.http.get<IAvatars>(this.widgetsUrl + "avatars");
  }

  githubCommits(repo: string, count?: number, force = false): Observable<IGithubCommit[]> {
    return this.widget<IGithubCommit[]>("github/commits", { repo, count }, force);
  }

  githubNotifications(force = false): Observable<IGithubNotification[]> {
    return this.widget<IGithubNotification[]>("github/notifications", {}, force);
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
