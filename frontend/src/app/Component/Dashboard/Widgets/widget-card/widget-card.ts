import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { I18nService } from '../../../../I18n/i18n.service';
import { TranslatePipe } from '../../../../I18n/translate.pipe';

@Component({
  selector: 'app-widget-card',
  imports: [CdkDragHandle, TranslatePipe],
  templateUrl: './widget-card.html',
  styleUrl: './widget-card.css',
})
export class WidgetCard {
  title = input.required<string>();
  service = input.required<string>();
  subtitle = input('');
  refreshRate = input(60);
  lastUpdate = input<Date | null>(null);
  iconUrl = input<string | null>(null);
  weather = input<string | null>(null);

  iconFailed = signal(false);
  private resetFailure = effect(() => {
    this.iconUrl();
    this.iconFailed.set(false);
  });
  loading = input(false);

  protected i18n = inject(I18nService);

  refreshLabel = computed(() => {
    const s = this.refreshRate();
    if (s < 60) return this.i18n.t('card.refresh_seconds', { n: s });
    const m = Math.round(s / 60);
    return m === 1 ? this.i18n.t('card.refresh_minute') : this.i18n.t('card.refresh_minutes', { n: m });
  });

  updatedAt = computed(() => this.lastUpdate()?.toLocaleTimeString(this.i18n.locale()) ?? '');

  refresh = output<void>();
  configure = output<void>();
  remove = output<void>();
}
