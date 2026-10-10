import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { ProfileService } from "../Service/Profile/profile.service";
import { fr, TranslationKey } from "./fr";
import { en } from "./en";

export type Lang = "fr" | "en";
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { fr, en };

/** Messages d'erreur de backend/api/integrations.py -> clés (les groupes deviennent {p1}, {p2}...). */
const API_ERRORS: [RegExp, TranslationKey][] = [
  [/^Upstream service unreachable\.$/, "api.unreachable"],
  [/^Upstream rejected the credentials, or the data is private\.$/, "api.rejected"],
  [/^Upstream rate limit reached, try again later\.$/, "api.rate_limit"],
  [/^Upstream returned HTTP (\d+)\.$/, "api.http"],
  [/^Upstream returned invalid JSON\.$/, "api.invalid_json"],
  [/^(.+) is not configured\.$/, "api.not_configured"],
  [/^City '(.+)' not found\.$/, "api.city_not_found"],
  [/^Game library is empty or its details are private\.$/, "api.library_private"],
  [/^Repository must look like 'owner\/name'\.$/, "api.repo_format"],
  // Validation des formulaires (serializers DRF)
  [/^Username already taken\.$/, "api.username_taken"],
  [/^A user with that username already exists\.$/, "api.username_taken"],
  [/^Email already in use\.$/, "api.email_taken"],
  [/^Enter a valid email address\.$/, "api.email_invalid"],
  [/^Image must be 5 MB or less\.$/, "api.image_size"],
  [/^Must be a 17-digit SteamID64\.$/, "api.steam_id"],
  // Mots de passe (validateurs de Django)
  [/^This password is too short\. It must contain at least (\d+) characters?\.$/, "api.password_short"],
  [/^This password is too common\.$/, "api.password_common"],
  [/^This password is entirely numeric\.$/, "api.password_numeric"],
  [/^The password is too similar to the .+\.$/, "api.password_similar"],
  [/^Current password is incorrect\.$/, "api.password_wrong"],
  [/^The new password must be different from the current one\.$/, "api.password_same"],
  [/^Too many attempts, try again later\.$/, "api.too_many_attempts"],
];

/**
 * Langue de l'interface. Enregistrée dans le profil Django (perso.language) :
 * rien n'est gardé dans le navigateur. Avant la connexion, on suit la langue du navigateur.
 */
@Injectable({ providedIn: "root" })
export class I18nService {
  private profiles = inject(ProfileService);

  readonly lang = signal<Lang>(navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en");
  /** Pour Intl / toLocaleString. */
  readonly locale = computed(() => (this.lang() === "fr" ? "fr-FR" : "en-US"));

  /** Langue choisie sur la page de connexion, avant d'avoir un profil. */
  private chosenWhileLoggedOut: Lang | null = null;

  constructor() {
    effect(() => {
      const saved = this.profiles.profile()?.perso.language;
      if (saved !== "fr" && saved !== "en") return;
      untracked(() => {
        const chosen = this.chosenWhileLoggedOut;
        this.chosenWhileLoggedOut = null;
        if (chosen && chosen !== saved) {
          // Choisie avant la connexion : on l'enregistre sur le compte plutôt que de l'écraser
          this.setLanguage(chosen);
        } else {
          this.lang.set(saved);
        }
      });
    });
    effect(() => {
      document.documentElement.lang = this.lang();
    });
  }

  /** Change la langue et l'enregistre sur le compte si on est connecté. */
  setLanguage(lang: Lang): void {
    this.lang.set(lang);
    if (!this.profiles.profile()) {
      this.chosenWhileLoggedOut = lang;
    } else {
      this.profiles.update({ perso: { language: lang } }).subscribe({
        error: () => this.profiles.refresh(),
      });
    }
  }

  /**
   * Traduit une clé. `{nom}` dans le texte est remplacé par params.nom.
   * Lit le signal `lang` : un template qui l'appelle se met à jour au changement de langue.
   */
  t(key: TranslationKey, params?: Record<string, string | number>): string {
    let text = DICTIONARIES[this.lang()][key] ?? fr[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  has(key: string): key is TranslationKey {
    return key in fr;
  }

  /** Code météo WMO d'Open-Meteo -> description. */
  weatherLabel(code: number): string {
    const key = `weather.code.${code}`;
    return this.has(key) ? this.t(key) : this.t("weather.code.unknown");
  }

  /**
   * Les erreurs des widgets viennent de Django, en anglais.
   * On traduit celles qu'on connaît ; les autres restent telles quelles.
   */
  apiError(message: string): string {
    for (const [pattern, key] of API_ERRORS) {
      const m = message.match(pattern);
      if (m) {
        const params: Record<string, string> = {};
        m.slice(1).forEach((value, i) => {
          // « Steam ID is not configured. » -> le libellé est traduit s'il est connu
          const label = `api.label.${value}`;
          params[`p${i + 1}`] = this.has(label) ? this.t(label) : value;
        });
        return this.t(key, params);
      }
    }
    return message;
  }

  /** Accord simple : clé + ".one" ou ".other" selon n. */
  plural(key: string, n: number, params?: Record<string, string | number>): string {
    const suffix = new Intl.PluralRules(this.locale()).select(n) === "one" ? "one" : "other";
    return this.t(`${key}.${suffix}` as TranslationKey, { n, ...params });
  }
}
