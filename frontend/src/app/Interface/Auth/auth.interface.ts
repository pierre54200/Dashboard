export interface ILogin {
  username: string;
  password: string;
  remember: boolean;
}

export interface IRegister {
  username: string;
  email: string;
  password: string;
  /** Langue de l'e-mail de confirmation et de l'interface */
  language?: "fr" | "en";
}

/** Réponse de POST /api/users/register : le compte attend la confirmation par e-mail. */
export interface IRegisterResult {
  detail: "confirmation_sent";
  email: string;
  email_sent: boolean;
}

/** Fournisseur de connexion activé côté Django (Google, GitHub). */
export interface IOAuthProvider {
  id: "google" | "github";
  name: string;
}

/** GET /api/users/me/connections */
export interface IConnections {
  has_password: boolean;
  providers: {
    id: "google" | "github";
    name: string;
    enabled: boolean;
    linked: boolean;
    account: string | null;
    linked_at: string | null;
  }[];
}

export interface IUser {
  id: number;
  username: string;
}