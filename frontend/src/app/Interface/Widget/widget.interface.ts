export interface IIntegrations {
  weather_city: string;
  steam_id: string;
  has_steam_friends_api_key: boolean;
  has_steam_updates_api_key: boolean;
  has_github_token: boolean;
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

export interface IAvatars {
  steam: string | null;
  steam_name: string | null;
  github: string | null;
  github_login: string | null;
}
