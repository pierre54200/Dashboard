import { Component, input, output } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';

/**
 * Coque commune à tous les widgets : en-tête, poignée de drag, boutons, pied.
 * Le contenu propre à chaque widget est injecté via <ng-content>.
 */
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
  configure = output<void>();
  remove = output<void>();
}
