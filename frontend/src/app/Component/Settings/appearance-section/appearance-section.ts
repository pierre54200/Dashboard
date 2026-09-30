import { Component, signal } from '@angular/core';
import { TEXT_SCALES, ThemePreference, ThemeService } from '../../../Service/Theme/theme.service';

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

  readonly textScales: { value: (typeof TEXT_SCALES)[number]; label: string }[] = [
    { value: 85, label: 'Petit' },
    { value: 100, label: 'Normal' },
    { value: 115, label: 'Grand' },
    { value: 130, label: 'Très grand' },
  ];

  /** Message d'erreur de l'import d'image */
  bgError = signal<string | null>(null);
  bgLoading = signal(false);

  constructor(public theme: ThemeService) {}

  select(value: ThemePreference): void {
    this.theme.setPreference(value);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de re-choisir le même fichier
    if (!file) return;

    this.bgError.set(null);
    this.bgLoading.set(true);
    this.bgError.set(await this.theme.setBackgroundFromFile(file));
    this.bgLoading.set(false);
  }

  onDimInput(event: Event, save: boolean): void {
    this.theme.setBackgroundDim(Number((event.target as HTMLInputElement).value), save);
  }
}