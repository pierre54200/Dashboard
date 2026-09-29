import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Trois façons de s'abonner à un service (cf. sujet) :
 *  - none        : disponible par défaut, rien à faire (ex : météo)
 *  - oauth       : on lie son compte via OAuth 2.0
 *  - credentials : on saisit ses identifiants ou une clé d'API
 */
type AuthType = 'none' | 'oauth' | 'credentials';

interface ServiceItem {
  id: string;
  name: string;
  description: string;
  widgets: number;
  auth: AuthType;
  subscribed: boolean;
  /** Compte lié, affiché quand on est abonné. */
  account?: string;
}

@Component({
  selector: 'app-services-section',
  imports: [FormsModule],
  templateUrl: './services-section.html',
  styleUrls: ['../settings-shared.css', './services-section.css'],
})
export class ServicesSection {
  // Données d'exemple, à remplacer par GET /api/services/
  services = signal<ServiceItem[]>([
    { id: 'weather', name: 'Météo', description: 'Température et prévisions pour une ville', widgets: 2, auth: 'none', subscribed: true },
    { id: 'rss', name: 'RSS', description: 'Derniers articles de n’importe quel flux', widgets: 1, auth: 'none', subscribed: true },
    { id: 'github', name: 'GitHub', description: 'Commits, issues et pull requests de tes dépôts', widgets: 3, auth: 'oauth', subscribed: true, account: 'pierre-dev' },
    { id: 'spotify', name: 'Spotify', description: 'Titre en cours d’écoute et top artistes', widgets: 2, auth: 'oauth', subscribed: false },
    { id: 'crypto', name: 'Crypto', description: 'Cours des cryptomonnaies en temps réel', widgets: 2, auth: 'credentials', subscribed: false },
  ]);

  filter = signal<'all' | 'subscribed' | 'available'>('all');

  filtered = computed(() => {
    const f = this.filter();
    return this.services().filter((s) =>
      f === 'all' ? true : f === 'subscribed' ? s.subscribed : !s.subscribed,
    );
  });

  subscribedCount = computed(() => this.services().filter((s) => s.subscribed).length);

  /** Service dont le formulaire d'identifiants est ouvert. */
  openForm = signal<string | null>(null);
  /** Service dont la désinscription attend confirmation. */
  confirmUnsub = signal<string | null>(null);

  apiKey = '';
  formError = signal<string | null>(null);

  connectOAuth(s: ServiceItem): void {
    // A brancher : redirection vers /api/oauth/<service>/login/ (Django gère le callback)
    // window.location.href = `${environment.apiUrl}/api/oauth/${s.id}/login/`;
    this.setSubscribed(s.id, true, 'mon-compte');
  }

  toggleForm(s: ServiceItem): void {
    this.apiKey = '';
    this.formError.set(null);
    this.openForm.set(this.openForm() === s.id ? null : s.id);
  }

  submitCredentials(s: ServiceItem): void {
    if (!this.apiKey.trim()) {
      this.formError.set('La clé d’API est requise.');
      return;
    }
    // A brancher : POST /api/services/<id>/subscribe/ { api_key }
    this.setSubscribed(s.id, true, 'Clé ••••' + this.apiKey.trim().slice(-4));
    this.openForm.set(null);
  }

  unsubscribe(s: ServiceItem): void {
    // A brancher : DELETE /api/services/<id>/subscribe/ (supprime aussi ses widgets)
    this.setSubscribed(s.id, false);
    this.confirmUnsub.set(null);
  }

  private setSubscribed(id: string, subscribed: boolean, account?: string): void {
    this.services.update((list) =>
      list.map((s) => (s.id === id ? { ...s, subscribed, account: subscribed ? account : undefined } : s)),
    );
  }
}
