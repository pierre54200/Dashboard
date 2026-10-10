import { Component, computed, input, output } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-widget-card',
  imports: [CdkDragHandle],
  templateUrl: './widget-card.html',
  styleUrl: './widget-card.css',
})
export class WidgetCard {
  title = input.required<string>();
  service = input.required<string>();
  subtitle = input('');
  refreshRate = input(60);
  lastUpdate = input<Date | null>(null);

  refreshLabel = computed(() => {
    const s = this.refreshRate();
    if (s < 60) return `toutes les ${s} s`;
    const m = Math.round(s / 60);
    return m === 1 ? 'toutes les minutes' : `toutes les ${m} min`;
  });

  refresh = output<void>();
  configure = output<void>();
  remove = output<void>();
}
