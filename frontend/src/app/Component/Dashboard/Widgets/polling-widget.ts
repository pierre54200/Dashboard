import {
  DestroyRef,
  Directive,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { Observable, Subscription } from "rxjs";
import { WidgetService } from "../../../Service/Widget/widget.service";

const MIN_REFRESH_SECONDS = 15;

@Directive()
export abstract class PollingWidget<T> {
  refreshRate = input(300);
  reloadKey = input(0);

  loaded = output<Date>();
  /** true pendant un chargement, pour faire tourner l'icône Actualiser de la carte. */
  busy = output<boolean>();

  data = signal<T | null>(null);
  error = signal<string | null>(null);
  loading = signal(false);

  protected readonly api = inject(WidgetService);
  private sub?: Subscription;
  private lastReloadKey = 0;

  constructor() {
    effect((onCleanup) => {
      const key = this.reloadKey();
      this.trackInputs();
      const seconds = Math.max(MIN_REFRESH_SECONDS, this.refreshRate());

      // reloadKey ne change que sur un clic sur Actualiser : on contourne alors le cache serveur
      const manual = key !== this.lastReloadKey;
      this.lastReloadKey = key;
      untracked(() => this.load(manual));
      const id = setInterval(() => this.load(), seconds * 1000);
      onCleanup(() => clearInterval(id));
    });

    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  /** `force` : actualisation manuelle, le backend doit ignorer son cache. */
  protected abstract fetch(force: boolean): Observable<T>;

  protected trackInputs(): void {}

  load(force = false): void {
    this.sub?.unsubscribe();
    this.setLoading(true);
    this.sub = this.fetch(force).subscribe({
      next: (value) => {
        this.data.set(value);
        this.error.set(null);
        this.setLoading(false);
        this.loaded.emit(new Date());
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.error ?? "Le serveur est injoignable.");
        this.setLoading(false);
      },
    });
  }

  private setLoading(value: boolean): void {
    this.loading.set(value);
    this.busy.emit(value);
  }
}
