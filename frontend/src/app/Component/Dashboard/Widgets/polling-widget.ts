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

  data = signal<T | null>(null);
  error = signal<string | null>(null);
  loading = signal(false);

  protected readonly api = inject(WidgetService);
  private sub?: Subscription;

  constructor() {
    effect((onCleanup) => {
      this.reloadKey();
      this.trackInputs();
      const seconds = Math.max(MIN_REFRESH_SECONDS, this.refreshRate());

      untracked(() => this.load());
      const id = setInterval(() => this.load(), seconds * 1000);
      onCleanup(() => clearInterval(id));
    });

    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected abstract fetch(): Observable<T>;

  protected trackInputs(): void {}

  load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.sub = this.fetch().subscribe({
      next: (value) => {
        this.data.set(value);
        this.error.set(null);
        this.loading.set(false);
        this.loaded.emit(new Date());
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.error ?? "Le serveur est injoignable.");
        this.loading.set(false);
      },
    });
  }
}
