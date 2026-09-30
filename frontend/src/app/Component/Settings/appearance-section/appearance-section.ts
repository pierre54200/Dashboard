import { Component } from '@angular/core';
import { ThemePreference, ThemeService } from '../../../Service/Theme/theme.service';

interface ThemeChoice {
  value: ThemePreference;
  label: string;
  description: string;
  /** Couleurs de l'aperçu : barre latérale, fond, carte */
  preview: [string, string, string];
}

@Component({
  selector: 'app-appearance-section',
  templateUrl: './appearance-section.html',
  styleUrls: ['../settings-shared.css', './appearance-section.css'],
})
export class AppearanceSection {
  readonly choices: ThemeChoice[] = [
    { value: 'dark', label: 'Sombre', description: 'Le look Discord classique', preview: ['#2b2d31', '#313338', '#1e1f22'] },
    { value: 'light', label: 'Clair', description: 'Fond blanc, contraste élevé', preview: ['#f2f3f5', '#ffffff', '#e3e5e8'] },
    { value: 'system', label: 'Système', description: 'Suit le réglage de ton appareil', preview: ['#2b2d31', '#313338', '#ffffff'] },
  ];

  constructor(public theme: ThemeService) {}

  select(value: ThemePreference): void {
    this.theme.setPreference(value);
  }
}
