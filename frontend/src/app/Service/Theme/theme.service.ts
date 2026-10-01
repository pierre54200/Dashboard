import { Injectable, computed, effect, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../../Environments/environment";

export type ThemePreference = "dark" | "light" | "system";
export type AppliedTheme = "dark" | "light";

interface Preferences {
  theme: ThemePreference;
  glass: boolean;
  background: string;
  background_dim: number;
  text_scale: number;
}

const STORAGE_KEY = "theme";
const GLASS_KEY = "glass";
const BG_KEY = "background";
const BG_DIM_KEY = "background_dim";
const TEXT_SCALE_KEY = "text_scale";

/** Tailles de texte proposées, en % de la taille par défaut du navigateur */
export const TEXT_SCALES = [85, 100, 115, 130] as const;
const VALID: ThemePreference[] = ["dark", "light", "system"];

/** Seuls les data URL d'images encodées en base64 sont acceptés (évite toute injection CSS) */
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // fichier choisi : 15 Mo max
const MAX_WIDTH = 1920; // l'image est redimensionnée à 1920 px de large max
const MAX_DATA_URL = 1_500_000; // taille max du résultat compressé (~1,1 Mo)

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly apiUrl = `${environment.apiUrl}users/me/preferences`;
  private readonly media = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly systemIsDark = signal(this.media.matches);

  /** Choix de l'utilisateur */
  readonly preference = signal<ThemePreference>(this.readStored());

  /** Widgets transparents façon Liquid Glass, combinable avec sombre ou clair */
  readonly glass = signal<boolean>(this.read(GLASS_KEY) === "true");

  /** Image d'arrière-plan (data URL) ou chaîne vide */
  readonly background = signal<string>(this.readBackground());

  /** Assombrissement de l'image, de 0 à 80 % */
  readonly backgroundDim = signal<number>(this.readDim());

  /** Taille du texte de tout le site, en % (100 = taille normale) */
  readonly textScale = signal<number>(this.readTextScale());

  /** Thème réellement appliqué */
  readonly applied = computed<AppliedTheme>(() => {
    const pref = this.preference();
    if (pref === "system") return this.systemIsDark() ? "dark" : "light";
    return pref;
  });

  /** Élément fixe qui affiche l'image derrière toute l'application */
  private wallpaperEl: HTMLDivElement | null = null;
  private wallpaperSource = "";
  private wallpaperUrl = "";

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
      // Toutes les tailles de texte sont en rem : changer la taille de <html> les met à l'échelle
      document.documentElement.style.fontSize = `${this.textScale()}%`;
    });

    effect(() => {
      this.renderWallpaper(this.background(), this.backgroundDim(), this.applied());
    });

    effect(() => {
      this.store(STORAGE_KEY, this.preference());
      this.store(GLASS_KEY, String(this.glass()));
      this.store(BG_DIM_KEY, String(this.backgroundDim()));
      this.store(TEXT_SCALE_KEY, String(this.textScale()));
    });

    effect(() => {
      const bg = this.background();
      if (bg) this.store(BG_KEY, bg);
      else this.remove(BG_KEY);
    });
  }

  /** Change le thème et le sauvegarde côté Django */
  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
    this.save({ theme: pref });
  }

  /** Active ou désactive l'effet verre */
  setGlass(enabled: boolean): void {
    this.glass.set(enabled);
    this.save({ glass: enabled });
  }

  /**
   * Prépare une image choisie par l'utilisateur : vérifie le type et la taille,
   * la redimensionne et la compresse en JPEG, puis l'applique en arrière-plan.
   * Renvoie un message d'erreur, ou null si tout s'est bien passé.
   */
  async setBackgroundFromFile(file: File): Promise<string | null> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return "Format non pris en charge. Utilise une image JPEG, PNG ou WebP.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "L'image est trop lourde (15 Mo maximum).";
    }

    let dataUrl: string;
    try {
      dataUrl = await this.compress(file);
    } catch {
      return "Impossible de lire cette image.";
    }
    if (!DATA_URL_RE.test(dataUrl) || dataUrl.length > MAX_DATA_URL) {
      return "L'image n'a pas pu être compressée suffisamment.";
    }

    this.background.set(dataUrl);
    this.save({ background: dataUrl });
    return null;
  }

  /** Retire l'image d'arrière-plan */
  clearBackground(): void {
    this.background.set("");
    this.save({ background: "" });
  }

  /** Met à jour l'assombrissement (save = false pendant que l'on fait glisser le curseur) */
  setBackgroundDim(value: number, save = true): void {
    const dim = Math.min(80, Math.max(0, Math.round(value)));
    this.backgroundDim.set(dim);
    if (save) this.save({ background_dim: dim });
  }

  /** Change la taille du texte de tout le site */
  setTextScale(value: number): void {
    if (!(TEXT_SCALES as readonly number[]).includes(value)) return;
    this.textScale.set(value);
    this.save({ text_scale: value });
  }

  /** Récupère les préférences enregistrées sur le compte (à appeler une fois connecté) */
  loadFromServer(): void {
    this.http.get<Preferences>(this.apiUrl).subscribe({
      next: (data) => {
        if (VALID.includes(data.theme)) this.preference.set(data.theme);
        if (typeof data.glass === "boolean") this.glass.set(data.glass);
        if (data.background === "" || DATA_URL_RE.test(data.background)) this.background.set(data.background);
        if (typeof data.background_dim === "number") this.backgroundDim.set(data.background_dim);
        if ((TEXT_SCALES as readonly number[]).includes(data.text_scale)) this.textScale.set(data.text_scale);
      },
      error: () => {
        /* non connecté : on garde le choix local */
      },
    });
  }

  private save(changes: Partial<Preferences>): void {
    this.http.patch(this.apiUrl, changes).subscribe({
      error: (err) => console.error(err),
    });
  }

  /** Redimensionne à 1920 px de large max et encode en JPEG, en baissant la qualité si besoin */
  private async compress(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let quality = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > MAX_DATA_URL && quality > 0.4) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    return dataUrl;
  }

  /**
   * Dessine l'image de fond dans un élément dédié.
   * L'image est convertie en URL blob (courte) : les très longues data URL
   * dans les variables CSS ne sont pas fiables sur tous les navigateurs (Firefox).
   */
  private renderWallpaper(dataUrl: string, dim: number, theme: AppliedTheme): void {
    const root = document.documentElement;

    if (!dataUrl) {
      this.wallpaperEl?.remove();
      this.wallpaperEl = null;
      if (this.wallpaperUrl) URL.revokeObjectURL(this.wallpaperUrl);
      this.wallpaperUrl = "";
      this.wallpaperSource = "";
      root.removeAttribute("data-bg");
      root.style.removeProperty("--app-bg");
      return;
    }

    if (dataUrl !== this.wallpaperSource) {
      if (this.wallpaperUrl) URL.revokeObjectURL(this.wallpaperUrl);
      this.wallpaperUrl = URL.createObjectURL(this.dataUrlToBlob(dataUrl));
      this.wallpaperSource = dataUrl;
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

    // Voile noir en thème sombre, blanc en thème clair, pour garder le texte lisible
    const c = theme === "dark" ? "0, 0, 0" : "255, 255, 255";
    const a = dim / 100;
    this.wallpaperEl.style.backgroundImage =
      `linear-gradient(rgba(${c}, ${a}), rgba(${c}, ${a})), url("${this.wallpaperUrl}")`;

    root.setAttribute("data-bg", "image");
    root.style.setProperty("--app-bg", "transparent");
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(",");
    const mime = header.slice(5, header.indexOf(";"));
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  private readStored(): ThemePreference {
    const value = this.read(STORAGE_KEY) as ThemePreference | null;
    return value && VALID.includes(value) ? value : "dark";
  }

  private readBackground(): string {
    const value = this.read(BG_KEY);
    return value && DATA_URL_RE.test(value) ? value : "";
  }

  private readDim(): number {
    const value = Number(this.read(BG_DIM_KEY));
    return Number.isFinite(value) && value >= 0 && value <= 80 ? value : 40;
  }

  private readTextScale(): number {
    const value = Number(this.read(TEXT_SCALE_KEY));
    return (TEXT_SCALES as readonly number[]).includes(value) ? value : 100;
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private store(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage plein ou indisponible : la valeur reste en mémoire et sur le serveur */
    }
  }

  private remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}