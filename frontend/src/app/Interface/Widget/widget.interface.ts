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
