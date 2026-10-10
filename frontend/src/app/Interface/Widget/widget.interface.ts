export interface IIntegrations {
  weather_city: string;
  steam_id: string;
  has_steam_friends_api_key: boolean;
  has_steam_updates_api_key: boolean;
  has_github_token: boolean;
  /** Le serveur a sa propre clé Steam : se connecter avec Steam suffit */
  steam_server_key: boolean;
  /** Clés OAuth GitHub présentes : on peut connecter GitHub sans coller de token */
  github_oauth_available: boolean;
  /** Un compte Spotify est lié */
  has_spotify: boolean;
  /** Clés Spotify présentes dans le .env du serveur (sinon la liaison est impossible) */
  spotify_available: boolean;
  spotify_display_name: string;
}

export interface IIntegrationsUpdate {
  weather_city?: string;
  steam_id?: string;
  steam_friends_api_key?: string;
  steam_updates_api_key?: string;
  github_token?: string;
}


export interface IWeather {
  city: string;
  country: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  } | null;
  units: Record<string, string> | null;
  today: {
    date: string;
    weather_code: number;
    temp_max: number;
    temp_min: number;
  } | null;
}

export interface ISteamFriend {
  steam_id: string;
  name: string;
  avatar: string;
  profile_url: string;
  status: number;
  game: string | null;
  game_id: string | null;
  last_logoff: number | null;
}

export interface ISteamUpdate {
  /** Identifiant unique de l'annonce (plusieurs annonces peuvent venir du même jeu) */
  id: string;
  app_id: number;
  game: string;
  header_image: string;
  title: string;
  summary: string;
  url: string;
  date: number;
}

export interface IGithubNotification {
  id: string;
  unread: boolean;
  reason: string;
  title: string;
  type: string;
  repo: string;
  url: string;
  updated_at: string;
}

export interface IGithubCommit {
  sha: string;
  message: string;
  author: string;
  author_login: string | null;
  avatar: string | null;
  url: string;
  date: string;
}

export interface ISteamMonthlyGame {
  app_id: number;
  name: string;
  header_image: string;
  minutes_this_month: number;
  hours_this_month: number;
}

export interface ISteamMonthlyPlaytime {
  month: string;
  tracked_since: string;
  games: ISteamMonthlyGame[];
}

/** GET /api/widgets/steam/achievements */
export interface ISteamAchievement {
  api_name: string;
  name: string;
  description: string;
  /** Icône en couleur si débloqué, grisée sinon */
  icon: string | null;
  unlocked: boolean;
  /** Timestamp Unix */
  unlock_time: number | null;
  /** Succès secret : la description peut être vide */
  hidden: boolean;
}

export interface ISteamAchievements {
  app_id: number;
  game: string;
  header_image: string;
  /** Sur tout le jeu, quel que soit le filtre */
  total: number;
  unlocked: number;
  achievements: ISteamAchievement[];
}

/** GET /api/widgets/steam/deals */
export interface ISteamDeal {
  app_id: number;
  name: string;
  image: string;
  url: string;
  currency: string | null;
  /** En centimes, null pour un jeu gratuit */
  original_price: number | null;
  final_price: number | null;
  discount_percent: number;
  /** Timestamp Unix de fin de promo (promos du moment uniquement) */
  discount_expiration: number | null;
  is_free: boolean;
}

export interface IAvatars {
  steam: string | null;
  steam_name: string | null;
  github: string | null;
  github_login: string | null;
  /** Photo du profil Spotify, null si non lié */
  spotify?: string | null;
}

/** Morceau ou épisode de podcast Spotify */
export interface ISpotifyTrack {
  id: string | null;
  name: string;
  artists: string;
  album: string | null;
  image: string | null;
  url: string | null;
  duration_ms: number | null;
  type: "track" | "episode";
}

/** GET /api/widgets/spotify/now-playing */
export interface ISpotifyNowPlaying {
  /** null quand rien ne joue */
  playing: (ISpotifyTrack & { is_playing: boolean; progress_ms: number | null }) | null;
  recent: (ISpotifyTrack & { played_at: string })[];
}

/** GET /api/widgets/spotify/top */
export interface ISpotifyTopItem {
  id: string;
  name: string;
  /** Artistes d'un titre, ou genres d'un artiste */
  subtitle: string;
  image: string | null;
  url: string | null;
}

/** GET /api/widgets/spotify/playlists */
export interface ISpotifyPlaylist {
  id: string;
  name: string;
  image: string | null;
  url: string | null;
  owner: string | null;
  owner_id: string | null;
  tracks: number | null;
  public: boolean | null;
  collaborative: boolean;
}
