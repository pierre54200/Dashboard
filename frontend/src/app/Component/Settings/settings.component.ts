import { Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountSection } from './account-section/account-section';
import { ServicesSection } from './services-section/services-section';
import { ConnectionsSection } from './connections-section/connections-section';
import { AppearanceSection } from './appearance-section/appearance-section';
import { AuthService } from '../../Service/Auth/auth.service';
import { TranslatePipe } from '../../I18n/translate.pipe';
import { TranslationKey } from '../../I18n/fr';

type Section = 'account' | 'services' | 'connections' | 'appearance';

@Component({
  selector: 'app-settings',
  imports: [AccountSection, ServicesSection, ConnectionsSection, AppearanceSection, TranslatePipe],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  // Retour d'une liaison Google / GitHub : on ouvre directement l'onglet Connexions
  private query = inject(ActivatedRoute).snapshot.queryParamMap;
  section = signal<Section>(
    this.query.has('oauth_linked') || this.query.has('oauth_error')
      ? 'connections'
      : this.query.has('service_linked') || this.query.has('service_error')
        ? 'services'
        : 'account',
  );

  readonly nav: { id: Section; label: TranslationKey }[] = [
    { id: 'account', label: 'settings.nav.account' },
    { id: 'services', label: 'settings.nav.services' },
    { id: 'connections', label: 'settings.nav.connections' },
    { id: 'appearance', label: 'settings.nav.appearance' },
  ];

  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}
  
  @HostListener('document:keydown.escape')
  close(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.authService.logout();
  }
}