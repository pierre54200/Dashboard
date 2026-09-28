import { Component, ElementRef, signal, viewChild } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { WidgetCard } from './Widgets/widget-card/widget-card';
import { WeatherWidget } from './Widgets/weather-widget/weather-widget';

export type WidgetType = 'weather';

export interface WidgetConfig {
  id: number;
  type: WidgetType;
  title: string;
  /** Largeur en colonnes (1 à 4). */
  cols: number;
  /** Hauteur en rangées (1 à 3). */
  rows: number;
  refreshRate: number;
  params: Record<string, string | number>;
}

@Component({
  selector: 'app-homepage',
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    WidgetCard,
    WeatherWidget,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  widgets = signal<WidgetConfig[]>([
    { id: 1, type: 'weather', title: 'Météo', cols: 1, rows: 1, refreshRate: 300, params: { city: 'Nancy' } },
    { id: 2, type: 'weather', title: 'Météo', cols: 1, rows: 1, refreshRate: 300, params: { city: 'Paris' } },
  ]);

  lastUpdate = new Date();

  /* Redimensionnement */

  readonly MAX_COLS = 4;
  readonly MAX_ROWS = 3;
  private readonly ROW_HEIGHT = 240;
  private readonly GAP = 16;

  private grid = viewChild<ElementRef<HTMLElement>>('grid');
  resizingId = signal<number | null>(null);

  startResize(event: PointerEvent, w: WidgetConfig): void {
    const gridEl = this.grid()?.nativeElement;
    if (!gridEl) return;
    event.preventDefault();
    event.stopPropagation();

    const grip = event.currentTarget as HTMLElement;
    grip.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startCols = w.cols;
    const startRows = w.rows;
    const colStep = (gridEl.clientWidth - this.GAP * (this.MAX_COLS - 1)) / this.MAX_COLS + this.GAP;
    const rowStep = this.ROW_HEIGHT + this.GAP;

    this.resizingId.set(w.id);

    const onMove = (e: PointerEvent) => {
      const cols = startCols + Math.round((e.clientX - startX) / colStep);
      const rows = startRows + Math.round((e.clientY - startY) / rowStep);
      this.setSize(w.id, cols, rows);
    };

    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      this.resizingId.set(null);
      // Ici : sauvegarder la nouvelle taille côté Django
    };

    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  resizeWithKeyboard(event: KeyboardEvent, w: WidgetConfig): void {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.setSize(w.id, w.cols + move[0], w.rows + move[1]);
  }

  private setSize(id: number, cols: number, rows: number): void {
    const c = Math.min(this.MAX_COLS, Math.max(1, cols));
    const r = Math.min(this.MAX_ROWS, Math.max(1, rows));
    this.widgets.update((list) =>
      list.map((w) => (w.id === id && (w.cols !== c || w.rows !== r) ? { ...w, cols: c, rows: r } : w)),
    );
  }

  drop(event: CdkDragDrop<unknown>): void {
    this.widgets.update((list) => {
      const copy = [...list];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
  }

  remove(w: WidgetConfig): void {
    this.widgets.update((list) => list.filter((x) => x.id !== w.id));
  }

  configure(w: WidgetConfig): void {
    // A brancher sur ta modale de configuration
    console.log('configurer', w);
  }

  refresh(w: WidgetConfig): void {
    // A brancher sur ton service de rafraîchissement
    console.log('actualiser', w);
  }

  /** Texte affiché sous le titre de la carte, ex : "Nancy". */
  subtitleOf(w: WidgetConfig): string {
    return String(Object.values(w.params)[0] ?? '');
  }
}