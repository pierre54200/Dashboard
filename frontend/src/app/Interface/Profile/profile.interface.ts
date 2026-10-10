/** GET/PATCH /api/users/me/profile */
export interface IProfile {
  id: number;
  info: {
    username: string;
    email: string;
    sexe: string;
    age: number | null;
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
  };
}

/** Mise à jour partielle : n'envoyer que ce qui change. `null` retire une image. */
export interface IProfileUpdate {
  info?: Partial<IProfile["info"]>;
  perso?: Partial<Omit<IProfile["perso"], "background" | "pfp">> & {
    background?: null;
    pfp?: null;
  };
}
