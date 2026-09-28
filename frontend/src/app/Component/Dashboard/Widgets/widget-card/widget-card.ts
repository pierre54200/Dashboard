import { Component, input, output } from '@angular/core';
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

  refresh = output<void>();
  remove = output<void>();
}
