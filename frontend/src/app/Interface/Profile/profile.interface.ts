/** GET/PATCH /api/users/me/profile */
export interface IProfile {
  id: number;
  info: {
    username: string;
    email: string;
    sexe: string;
    age: number | null;
    /** false : compte créé avec Google/GitHub, sans mot de passe (lecture seule) */
    has_password: boolean;
  };
  perso: {
    /** URL absolue de l'image, null si aucune */
    background: string | null;
    pfp: string | null;
    /** 0 sombre, 1 clair, 2 système */
    theme: number;
    glass: boolean;
    /** Voile sur l'arrière-plan, de 0 à 80 % */
    background_dim: number;
    /** 85, 100, 115 ou 130 % */
    text_scale: number;
    /** Langue de l'interface */
    language: "fr" | "en";
  };
}

/** Mise à jour partielle : n'envoyer que ce qui change. `null` retire une image. */
export interface IProfileUpdate {
  info?: Partial<Omit<IProfile["info"], "has_password">>;
  perso?: Partial<Omit<IProfile["perso"], "background" | "pfp">> & {
    background?: null;
    pfp?: null;
  };
}
