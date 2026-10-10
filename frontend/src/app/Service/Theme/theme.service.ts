import { Injectable, computed, effect, signal, untracked } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { IProfileUpdate } from "../../Interface/Profile/profile.interface";
import { ProfileService, checkImageFile, compressImage } from "../Profile/profile.service";
import type { TranslationKey } from "../../I18n/fr";

export type ThemePreference = "dark" | "light" | "system";
export type AppliedTheme = "dark" | "light";

export const TEXT_SCALES = [85, 100, 115, 130] as const;

/** perso.theme côté Django : 0 sombre, 1 clair, 2 système. */
const THEMES: ThemePreference[] = ["dark", "light", "system"];

const DEFAULTS = { theme: "dark" as ThemePreference, glass: false, dim: 40, textScale: 100 };
const MAX_BACKGROUND_WIDTH = 1920;

/**
 * Applique l'apparence du profil (thème, effet verre, taille du texte, arrière-plan).
 * Tout est lu depuis /api/users/me/profile et enregistré par PATCH sur la même route :
 * rien n'est gardé dans le navigateur.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly media = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly systemIsDark = signal(this.media.matches);

  readonly preference = signal<ThemePreference>(DEFAULTS.theme);
  readonly glass = signal<boolean>(DEFAULTS.glass);
  /** URL de l'image servie par Django, "" si aucune. */
  readonly background = signal<string>("");
  readonly backgroundDim = signal<number>(DEFAULTS.dim);
  readonly textScale = signal<number>(DEFAULTS.textScale);

  readonly applied = computed<AppliedTheme>(() => {
    const pref = this.preference();
    if (pref === "system") return this.systemIsDark() ? "dark" : "light";
    return pref;
  });

  private wallpaperEl: HTMLDivElement | null = null;

  constructor(private profiles: ProfileService) {
    this.media.addEventListener("change", (e) => this.systemIsDark.set(e.matches));

    effect(() => {
      const perso = this.profiles.profile()?.perso;
      untracked(() => {
        this.preference.set(THEMES[perso?.theme ?? 0] ?? DEFAULTS.theme);
        this.glass.set(perso?.glass ?? DEFAULTS.glass);
        this.background.set(perso?.background ?? "");
        this.backgroundDim.set(perso?.background_dim ?? DEFAULTS.dim);
        const scale = perso?.text_scale ?? DEFAULTS.textScale;
        this.textScale.set((TEXT_SCALES as readonly number[]).includes(scale) ? scale : DEFAULTS.textScale);
      });
    });

    effect(() => {
      const theme = this.applied();
      const root = document.documentElement;
      root.setAttribute("data-theme", theme);
      root.setAttribute("data-bs-theme", theme);
    });

    effect(() => {
      document.documentElement.setAttribute("data-glass", this.glass() ? "on" : "off");
    });

    effect(() => {
      document.documentElement.style.fontSize = `${this.textScale()}%`;
    });

    effect(() => {
      this.renderWallpaper(this.background(), this.backgroundDim(), this.applied());
    });

    this.loadFromServer();
  }

  loadFromServer(): void {
    this.profiles.refresh();
  }

  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
    this.save({ theme: THEMES.indexOf(pref) });
  }

  setGlass(enabled: boolean): void {
    this.glass.set(enabled);
    this.save({ glass: enabled });
  }

  setBackgroundDim(value: number, save = true): void {
    const dim = Math.min(80, Math.max(0, Math.round(value)));
    this.backgroundDim.set(dim);
    if (save) this.save({ background_dim: dim });
  }

  setTextScale(value: number): void {
    if (!(TEXT_SCALES as readonly number[]).includes(value)) return;
    this.textScale.set(value);
    this.save({ text_scale: value });
  }

  async setBackgroundFromFile(file: File): Promise<TranslationKey | null> {
    const invalid = checkImageFile(file);
    if (invalid) return invalid;

    let image: Blob;
    try {
      image = await compressImage(file, MAX_BACKGROUND_WIDTH);
    } catch {
      return "image.error.read";
    }
    try {
      await firstValueFrom(this.profiles.uploadImage("background", image));
      return null;
    } catch {
      return "image.error.upload";
    }
  }

  clearBackground(): void {
    this.background.set("");
    this.profiles.update({ perso: { background: null } }).subscribe({
      error: () => this.profiles.refresh(),
    });
  }

  private save(perso: IProfileUpdate["perso"]): void {
    this.profiles.update({ perso }).subscribe({
      error: () => this.profiles.refresh(),
    });
  }

  private renderWallpaper(url: string, dim: number, theme: AppliedTheme): void {
    const root = document.documentElement;

    if (!url) {
      this.wallpaperEl?.remove();
      this.wallpaperEl = null;
      root.removeAttribute("data-bg");
      root.style.removeProperty("--app-bg");
      return;
    }

    if (!this.wallpaperEl) {
      const el = document.createElement("div");
      el.className = "app-wallpaper";
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed",
        inset: "0",
        zIndex: "-1",
        pointerEvents: "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      });
      document.body.prepend(el);
      this.wallpaperEl = el;
    }

    const c = theme === "dark" ? "0, 0, 0" : "255, 255, 255";
    const a = dim / 100;
    const safeUrl = encodeURI(decodeURI(url)).replace(/["'()]/g, (ch) => `%${ch.charCodeAt(0).toString(16)}`);
    this.wallpaperEl.style.backgroundImage =
      `linear-gradient(rgba(${c}, ${a}), rgba(${c}, ${a})), url("${safeUrl}")`;

    root.setAttribute("data-bg", "image");
    root.style.setProperty("--app-bg", "transparent");
  }
}
