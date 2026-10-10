import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../Environments/environment";
import {
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

  weather(city?: string): Observable<IWeather> {
    const params = city ? new HttpParams().set("city", city) : undefined;
    return this.http.get<IWeather>(this.widgetsUrl + "weather", { params });
  }

  steamFriends(): Observable<ISteamFriend[]> {
    return this.http.get<ISteamFriend[]>(this.widgetsUrl + "steam/friends");
  }

  steamUpdates(): Observable<ISteamUpdate[]> {
    return this.http.get<ISteamUpdate[]>(this.widgetsUrl + "steam/updates");
  }

  steamMonthlyPlaytime(count?: number): Observable<ISteamMonthlyPlaytime> {
    const params = count ? new HttpParams().set("count", count) : undefined;
    return this.http.get<ISteamMonthlyPlaytime>(this.widgetsUrl + "steam/monthly-playtime", { params });
  }

  githubCommits(repo: string, count?: number): Observable<IGithubCommit[]> {
    let params = new HttpParams().set("repo", repo);
    if (count) params = params.set("count", count);
    return this.http.get<IGithubCommit[]>(this.widgetsUrl + "github/commits", { params });
  }

  githubNotifications(): Observable<IGithubNotification[]> {
    return this.http.get<IGithubNotification[]>(this.widgetsUrl + "github/notifications");
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
