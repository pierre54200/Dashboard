import { Component, computed, signal } from '@angular/core';

/**
 * Comptes tiers utilisables pour SE CONNECTER à la plateforme (OIDC / OAuth).
 * A ne pas confondre avec les services : eux servent à alimenter les widgets.
 */
interface Provider {
  id: string;
  name: string;
  linked: boolean;
  account?: string;
}

@Component({
  selector: 'app-connections-section',
  templateUrl: './connections-section.html',
  styleUrls: ['../settings-shared.css', './connections-section.css'],
})
export class ConnectionsSection {
  /** Si l'utilisateur n'a pas de mot de passe, il doit garder au moins une connexion. */
  hasPassword = true;

  // Données d'exemple, à remplacer par GET /api/me/connections/
  providers = signal<Provider[]>([
    { id: 'google', name: 'Google', linked: true, account: 'pierre@gmail.com' },
    { id: 'github', name: 'GitHub', linked: false },
    { id: 'discord', name: 'Discord', linked: false },
  ]);

  linkedCount = computed(() => this.providers().filter((p) => p.linked).length);

  canUnlink = computed(() => this.hasPassword || this.linkedCount() > 1);

  link(p: Provider): void {
    // A brancher : window.location.href = `${environment.apiUrl}/api/auth/${p.id}/link/`;
    this.set(p.id, true, 'mon-compte');
  }

  unlink(p: Provider): void {
    if (!this.canUnlink()) return;
    // A brancher : DELETE /api/me/connections/<id>/
    this.set(p.id, false);
  }

  private set(id: string, linked: boolean, account?: string): void {
    this.providers.update((list) =>
      list.map((p) => (p.id === id ? { ...p, linked, account: linked ? account : undefined } : p)),
    );
  }
}
