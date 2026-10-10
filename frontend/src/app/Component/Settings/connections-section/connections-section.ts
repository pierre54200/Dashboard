import { Component, computed, signal } from '@angular/core';
import { TranslatePipe } from '../../../I18n/translate.pipe';

interface Provider {
  id: string;
  name: string;
  linked: boolean;
  account?: string;
}

@Component({
  selector: 'app-connections-section',
  imports: [TranslatePipe],
  templateUrl: './connections-section.html',
  styleUrls: ['../settings-shared.css', './connections-section.css'],
})
export class ConnectionsSection {
  hasPassword = true;

  providers = signal<Provider[]>([
    { id: 'google', name: 'Google', linked: true, account: 'pierre@gmail.com' },
    { id: 'github', name: 'GitHub', linked: false },
    { id: 'discord', name: 'Discord', linked: false },
  ]);

  linkedCount = computed(() => this.providers().filter((p) => p.linked).length);

  canUnlink = computed(() => this.hasPassword || this.linkedCount() > 1);

  link(p: Provider): void {
    this.set(p.id, true, 'mon-compte');
  }

  unlink(p: Provider): void {
    if (!this.canUnlink()) return;
    this.set(p.id, false);
  }

  private set(id: string, linked: boolean, account?: string): void {
    this.providers.update((list) =>
      list.map((p) => (p.id === id ? { ...p, linked, account: linked ? account : undefined } : p)),
    );
  }
}
