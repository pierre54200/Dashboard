import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { WidgetService } from '../../../Service/Widget/widget.service';
import { IIntegrations, IIntegrationsUpdate } from '../../../Interface/Widget/widget.interface';
import { TranslatePipe } from '../../../I18n/translate.pipe';
import { I18nService } from '../../../I18n/i18n.service';

type ServiceId = 'weather' | 'steam' | 'github';

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
    const steamOk = !!i?.steam_id && !!(i?.has_steam_friends_api_key || i?.has_steam_updates_api_key);
    return [
      {
        id: 'weather',
        name: this.i18n.t('service.weather'),
        description: this.i18n.t('services.weather.desc'),
        widgets: 1,
        byDefault: true,
        configured: true,
        account: i?.weather_city ? this.i18n.t('services.weather.account', { city: i.weather_city }) : undefined,
      },
      {
        id: 'steam',
        name: 'Steam',
        description: this.i18n.t('services.steam.desc'),
        widgets: 2,
        byDefault: false,
        configured: steamOk,
        account: i?.steam_id ? `Steam ID ${i.steam_id}` : undefined,
      },
      {
        id: 'github',
        name: 'GitHub',
        description: this.i18n.t('services.github.desc'),
        widgets: 1,
        byDefault: false,
        configured: !!i?.has_github_token,
        account: i?.has_github_token ? this.i18n.t('services.github.account') : undefined,
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

  ngOnInit(): void {
    this.api.getIntegrations().subscribe({
      next: (data) => this.info.set(data),
      error: () => this.loadError.set(this.i18n.t('services.error.load')),
    });
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
      if (!key && !i?.has_steam_friends_api_key) {
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
