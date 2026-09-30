import { Injectable, computed, effect, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../../Environments/environment";

export type ThemePreference = "dark" | "light" | "system";
export type AppliedTheme = "dark" | "light";

const STORAGE_KEY = "theme";
const GLASS_KEY = "glass";
const VALID: ThemePreference[] = ["dark", "light", "system"];

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly apiUrl = `${environment.apiUrl}users/me/preferences`;
  private readonly media = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly systemIsDark = signal(this.media.matches);

  /** Choix de l'utilisateur */
  readonly preference = signal<ThemePreference>(this.readStored());

  /** Widgets transparents façon Liquid Glass, combinable avec sombre ou clair */
  readonly glass = signal<boolean>(this.readGlass());

  /** Thème réellement appliqué */
  readonly applied = computed<AppliedTheme>(() => {
    const pref = this.preference();
    if (pref === "system") return this.systemIsDark() ? "dark" : "light";
    return pref;
  });

  constructor(private http: HttpClient) {
    this.media.addEventListener("change", (e) => this.systemIsDark.set(e.matches));

    effect(() => {
      const theme = this.applied();
      const root = document.documentElement;
      root.setAttribute("data-theme", theme); // variables CSS + Tailwind
      root.setAttribute("data-bs-theme", theme); // Bootstrap 5.3
    });

    effect(() => {
      document.documentElement.setAttribute("data-glass", this.glass() ? "on" : "off");
    });

    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.preference());
        localStorage.setItem(GLASS_KEY, String(this.glass()));
      } catch {
        /* stockage indisponible */
      }
    });
  }

  /** Change le thème et le sauvegarde côté Django */
  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
    this.http.patch(this.apiUrl, { theme: pref }).subscribe({
      error: (err) => console.error(err),
    });
  }

  /** Active ou désactive l'effet verre et le sauvegarde côté Django */
  setGlass(enabled: boolean): void {
    this.glass.set(enabled);
    this.http.patch(this.apiUrl, { glass: enabled }).subscribe({
      error: (err) => console.error(err),
    });
  }

  /** Récupère la préférence enregistrée sur le compte (à appeler une fois connecté) */
  loadFromServer(): void {
    this.http.get<{ theme: ThemePreference; glass: boolean }>(this.apiUrl).subscribe({
      next: (data) => {
        if (VALID.includes(data.theme)) this.preference.set(data.theme);
        if (typeof data.glass === "boolean") this.glass.set(data.glass);
      },
      error: () => {
        /* non connecté : on garde le choix local */
      },
    });
  }

  private readStored(): ThemePreference {
    try {
      const value = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
      if (value && VALID.includes(value)) return value;
    } catch {
      /* ignore */
    }
    return "dark";
  }

  private readGlass(): boolean {
    try {
      return localStorage.getItem(GLASS_KEY) === "true";
    } catch {
      return false;
    }
  }
}
