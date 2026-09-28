import { Component, HostListener, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AccountSection } from './account-section/account-section';
import { ServicesSection } from './services-section/services-section';
import { ConnectionsSection } from './connections-section/connections-section';

type Section = 'account' | 'services' | 'connections';

@Component({
  selector: 'app-settings',
  imports: [AccountSection, ServicesSection, ConnectionsSection],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  section = signal<Section>('account');

  readonly nav: { id: Section; label: string }[] = [
    { id: 'account', label: 'Mon compte' },
    { id: 'services', label: 'Services' },
    { id: 'connections', label: 'Connexions' },
  ];

  constructor(private router: Router) {}

  /** Echap ferme les paramètres, comme sur Discord. */
  @HostListener('document:keydown.escape')
  close(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.router.navigate(['/login']);
  }
}
