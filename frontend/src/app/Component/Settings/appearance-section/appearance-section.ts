import { Component, signal } from '@angular/core';
import { TEXT_SCALES, ThemePreference, ThemeService } from '../../../Service/Theme/theme.service';
import { TranslatePipe } from '../../../I18n/translate.pipe';
import { I18nService } from '../../../I18n/i18n.service';
import { TranslationKey } from '../../../I18n/fr';
import { LanguageSwitch } from '../../Shared/language-switch/language-switch';

interface ThemeChoice {
  value: ThemePreference;
  label: TranslationKey;
  description: TranslationKey;
  preview: [string, string, string];
}

@Component({
  selector: 'app-appearance-section',
  imports: [TranslatePipe, LanguageSwitch],
  templateUrl: './appearance-section.html',
  styleUrls: ['../settings-shared.css', './appearance-section.css'],
})
export class AppearanceSection {
  readonly choices: ThemeChoice[] = [
    { value: 'dark', label: 'appearance.theme.dark', description: 'appearance.theme.dark_desc', preview: ['#2b2d31', '#313338', '#1e1f22'] },
    { value: 'light', label: 'appearance.theme.light', description: 'appearance.theme.light_desc', preview: ['#f2f3f5', '#ffffff', '#e3e5e8'] },
    { value: 'system', label: 'appearance.theme.system', description: 'appearance.theme.system_desc', preview: ['#2b2d31', '#313338', '#ffffff'] },
  ];

  readonly textScales: { value: (typeof TEXT_SCALES)[number]; label: TranslationKey }[] = [
    { value: 85, label: 'appearance.text.small' },
    { value: 100, label: 'appearance.text.normal' },
    { value: 115, label: 'appearance.text.large' },
    { value: 130, label: 'appearance.text.xlarge' },
  ];

  bgError = signal<string | null>(null);
  bgLoading = signal(false);

  constructor(
    public theme: ThemeService,
    private i18n: I18nService,
  ) {}

  select(value: ThemePreference): void {
    this.theme.setPreference(value);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.bgError.set(null);
    this.bgLoading.set(true);
    const error = await this.theme.setBackgroundFromFile(file);
    this.bgError.set(error ? this.i18n.t(error) : null);
    this.bgLoading.set(false);
  }

  onDimInput(event: Event, save: boolean): void {
    this.theme.setBackgroundDim(Number((event.target as HTMLInputElement).value), save);
  }
}