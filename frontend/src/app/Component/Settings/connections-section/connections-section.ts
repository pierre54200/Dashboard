import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../Service/Auth/auth.service';
import { IConnections } from '../../../Interface/Auth/auth.interface';
import { I18nService } from '../../../I18n/i18n.service';
import { TranslationKey } from '../../../I18n/fr';
import { TranslatePipe } from '../../../I18n/translate.pipe';

type Provider = IConnections['providers'][number];

/** Comptes Google / GitHub liés, lus et modifiés via /api/users/me/connections. */
@Component({
  selector: 'app-connections-section',
  imports: [TranslatePipe],
  templateUrl: './connections-section.html',
  styleUrls: ['../settings-shared.css', './connections-section.css'],
})
export class ConnectionsSection implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  i18n = inject(I18nService);

  loading = signal(true);
  hasPassword = signal(true);
  providers = signal<Provider[]>([]);
  busy = signal<string | null>(null);
  /** Message affiché en haut de la section (retour de Google / GitHub, erreur...). */
  notice = signal<{ kind: 'success' | 'error'; key: TranslationKey; name?: string } | null>(null);

  linked = computed(() => this.providers().filter((p) => p.linked));
  available = computed(() => this.providers().filter((p) => !p.linked));
  /** Dissocier n'est possible que s'il reste un mot de passe ou un autre compte lié. */
  canUnlink = computed(() => this.hasPassword() || this.linked().length > 1);
  /** Aucun fournisseur restant n'a de client OAuth configuré dans le .env de Django. */
  noneConfigured = computed(() => this.available().length > 0 && this.available().every((p) => !p.enabled));

  linkedDate(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { dateStyle: 'long' }).format(new Date(iso));
  }

  ngOnInit(): void {
    this.readReturnParams();
    this.load();
  }

  link(p: Provider): void {
    if (!p.enabled) return;
    this.busy.set(p.id);
    this.auth.startOAuth(p.id, true);
  }

  unlink(p: Provider): void {
    if (!this.canUnlink()) return;
    this.busy.set(p.id);
    this.notice.set(null);
    this.auth.unlink(p.id).subscribe({
      next: (data) => {
        this.apply(data);
        this.busy.set(null);
        this.notice.set({ kind: 'success', key: 'connections.unlinked', name: p.name });
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.notice.set({
          kind: 'error',
          key: err.error?.code === 'keep_one' ? 'connections.keep_one' : 'widget.error.server',
        });
      },
    });
  }

  private load(): void {
    this.auth.connections().subscribe({
      next: (data) => {
        this.apply(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notice.set({ kind: 'error', key: 'widget.error.server' });
      },
    });
  }

  private apply(data: IConnections): void {
    this.hasPassword.set(data.has_password);
    this.providers.set(data.providers);
  }

  /** Après la liaison, Django renvoie sur /dashboard/settings?oauth_linked=github (ou oauth_error=...). */
  private readReturnParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const linked = params.get('oauth_linked');
    const error = params.get('oauth_error');
    if (!linked && !error) return;

    if (linked) {
      const name = linked === 'github' ? 'GitHub' : linked === 'google' ? 'Google' : linked;
      this.notice.set({ kind: 'success', key: 'connections.linked_ok', name });
    } else {
      const key = `oauth.error.${error}`;
      this.notice.set({ kind: 'error', key: this.i18n.has(key) ? (key as TranslationKey) : 'oauth.error.failed' });
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
