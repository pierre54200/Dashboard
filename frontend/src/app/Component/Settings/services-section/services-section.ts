import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { WidgetService } from '../../../Service/Widget/widget.service';
import { IIntegrations, IIntegrationsUpdate } from '../../../Interface/Widget/widget.interface';
import { TranslatePipe } from '../../../I18n/translate.pipe';
import { I18nService } from '../../../I18n/i18n.service';
import { WIDGET_CATALOG } from '../../Dashboard/dashboard.component';

type ServiceId = 'weather' | 'steam' | 'github' | 'spotify';

/** Nombre de widgets de chaque service, d'après le catalogue du dashboard. */
const widgetCount = (id: ServiceId) => WIDGET_CATALOG.filter((d) => d.service === `service.${id}`).length;

interface ServiceItem {
  id: ServiceId;
  name: string;
  description: string;
  widgets: number;
  /** Disponible sans configuration (météo). */
  byDefault: boolean;
  configured: boolean;
  /** Résumé affiché sous la description. */
  account?: string;
  /** Liaison seulement par fenêtre de connexion (Spotify). */
  oauth?: boolean;
  /** Pour un service OAuth : clés présentes dans le .env du serveur. */
  available?: boolean;
  /** Bouton « Se connecter avec ... » proposé en plus du formulaire (Steam, GitHub). */
  signIn?: boolean;
}

@Component({
  selector: 'app-services-section',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './services-section.html',
  styleUrls: ['../settings-shared.css', './services-section.css'],
})
export class ServicesSection implements OnInit {
  private api = inject(WidgetService);
  protected i18n = inject(I18nService);

  /** Ce que Django renvoie (sans les secrets). */
  info = signal<IIntegrations | null>(null);
  loadError = signal<string | null>(null);

  services = computed<ServiceItem[]>(() => {
    const i = this.info();
    // Avec la clé du serveur, le Steam ID (donné par la fenêtre Steam) suffit
    const steamOk =
      !!i?.steam_id && !!(i?.has_steam_friends_api_key || i?.has_steam_updates_api_key || i?.steam_server_key);
    return [
      {
        id: 'weather',
        name: this.i18n.t('service.weather'),
        description: this.i18n.t('services.weather.desc'),
        widgets: widgetCount('weather'),
        byDefault: true,
        configured: true,
        account: i?.weather_city ? this.i18n.t('services.weather.account', { city: i.weather_city }) : undefined,
      },
      {
        id: 'steam',
        name: 'Steam',
        description: this.i18n.t('services.steam.desc'),
        widgets: widgetCount('steam'),
        byDefault: false,
        configured: steamOk,
        account: i?.steam_id ? `Steam ID ${i.steam_id}` : undefined,
        signIn: true,
      },
      {
        id: 'github',
        name: 'GitHub',
        description: this.i18n.t('services.github.desc'),
        widgets: widgetCount('github'),
        byDefault: false,
        configured: !!i?.has_github_token,
        account: i?.has_github_token ? this.i18n.t('services.github.account') : undefined,
        signIn: !!i?.github_oauth_available,
      },
      {
        id: 'spotify',
        name: 'Spotify',
        description: this.i18n.t('services.spotify.desc'),
        widgets: widgetCount('spotify'),
        byDefault: false,
        configured: !!i?.has_spotify,
        account: i?.has_spotify ? this.i18n.t('services.spotify.account', { name: i.spotify_display_name }) : undefined,
        oauth: true,
        available: !!i?.spotify_available,
      },
    ];
  });

  filter = signal<'all' | 'subscribed' | 'available'>('all');

  filtered = computed(() => {
    const f = this.filter();
    return this.services().filter((s) =>
      f === 'all' ? true : f === 'subscribed' ? s.configured : !s.configured,
    );
  });

  subscribedCount = computed(() => this.services().filter((s) => s.configured).length);

  /** Service dont le formulaire est ouvert. */
  openForm = signal<ServiceId | null>(null);
  /** Service dont la déconnexion attend confirmation. */
  confirmUnsub = signal<ServiceId | null>(null);

  saving = signal(false);
  formError = signal<string | null>(null);
  saved = signal<ServiceId | null>(null);

  /* Champs des formulaires */
  city = '';
  steamId = '';
  steamKey = '';
  githubToken = '';

  /** Retour de Spotify : succès ou erreur, d'après les paramètres de l'URL. */
  notice = signal<{ kind: 'success' | 'error'; text: string } | null>(null);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const linked = params.get('service_linked');
    const error = params.get('service_error');
    if (linked || error) {
      if (linked) {
        const names: Record<string, string> = { steam: 'Steam', github: 'GitHub', spotify: 'Spotify' };
        this.notice.set({ kind: 'success', text: this.i18n.t('services.linked', { name: names[linked] ?? linked }) });
      } else {
        // Codes communs à GitHub, Steam et Spotify, puis ceux propres à Spotify
        const key = [`oauth.error.${error}`, `services.spotify.error.${error}`].find((k) => this.i18n.has(k));
        this.notice.set({ kind: 'error', text: this.i18n.t((key ?? 'oauth.error.failed') as never) });
      }
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }

    this.api.getIntegrations().subscribe({
      next: (data) => this.info.set(data),
      error: () => this.loadError.set(this.i18n.t('services.error.load')),
    });
  }

  /** Spotify : navigation vers Django, qui redirige vers la page d'autorisation de Spotify. */
  connect(s: ServiceItem): void {
    if (s.id === 'spotify' && s.available) this.api.spotifyConnect();
    if (s.id === 'steam') this.api.steamConnect();
    if (s.id === 'github') this.api.githubConnect();
  }

  toggleForm(s: ServiceItem): void {
    const i = this.info();
    this.city = i?.weather_city ?? '';
    this.steamId = i?.steam_id ?? '';
    this.steamKey = '';
    this.githubToken = '';
    this.formError.set(null);
    this.saved.set(null);
    this.confirmUnsub.set(null);
    this.openForm.set(this.openForm() === s.id ? null : s.id);
  }

  submit(s: ServiceItem): void {
    const changes: IIntegrationsUpdate = {};
    const i = this.info();

    if (s.id === 'weather') {
      changes.weather_city = this.city.trim();
    }

    if (s.id === 'steam') {
      const id = this.steamId.trim();
      const key = this.steamKey.trim();
      if (!/^\d{17}$/.test(id)) {
        this.formError.set(this.i18n.t('services.error.steam_id'));
        return;
      }
      if (!key && !i?.has_steam_friends_api_key && !i?.steam_server_key) {
        this.formError.set(this.i18n.t('services.error.steam_key_required'));
        return;
      }
      if (key && !/^[0-9A-Fa-f]{32}$/.test(key)) {
        this.formError.set(this.i18n.t('services.error.steam_key_format'));
        return;
      }
      changes.steam_id = id;
      if (key) changes.steam_friends_api_key = key;
    }

    if (s.id === 'github') {
      const token = this.githubToken.trim();
      if (!token) {
        this.formError.set(this.i18n.t('services.error.github_required'));
        return;
      }
      changes.github_token = token;
    }

    this.send(s.id, changes, true);
  }

  unsubscribe(s: ServiceItem): void {
    if (s.id === 'spotify') {
      this.saving.set(true);
      this.api.spotifyUnlink().subscribe({
        next: () => {
          this.saving.set(false);
          this.confirmUnsub.set(null);
          this.ngOnInit();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.formError.set(this.messageFrom(err));
        },
      });
      return;
    }
    const changes: IIntegrationsUpdate =
      s.id === 'steam'
        ? { steam_id: '', steam_friends_api_key: '', steam_updates_api_key: '' }
        : { github_token: '' };
    this.send(s.id, changes, false);
  }

  private send(id: ServiceId, changes: IIntegrationsUpdate, showSaved: boolean): void {
    this.saving.set(true);
    this.formError.set(null);
    this.api.updateIntegrations(changes).subscribe({
      next: (data) => {
        this.info.set(data);
        this.saving.set(false);
        this.openForm.set(null);
        this.confirmUnsub.set(null);
        this.saved.set(showSaved ? id : null);
        this.steamKey = '';
        this.githubToken = '';
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(this.messageFrom(err));
      },
    });
  }

  /** DRF renvoie { champ: ["message"] } ou { detail: "..." }. */
  private messageFrom(err: HttpErrorResponse): string {
    if (err.status === 0) return this.i18n.t('widget.error.server');
    if (err.status === 403) return this.i18n.t('services.error.session');
    const body = err.error;
    if (body && typeof body === 'object') {
      const first = Object.values(body)[0];
      if (Array.isArray(first)) return this.i18n.apiError(String(first[0]));
      if (typeof first === 'string') return this.i18n.apiError(first);
    }
    return this.i18n.t('common.save_failed');
  }
}
