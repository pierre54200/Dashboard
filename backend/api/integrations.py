import re
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar

import requests
from django.core.cache import cache
from django.utils import timezone

from .models import SteamPlaytimeSnapshot

TIMEOUT = 8

STEAM = "https://api.steampowered.com"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GITHUB_NOTIFICATIONS_URL = "https://api.github.com/notifications"

TTL_WEATHER = 600
TTL_GEOCODE = 60 * 60 * 24
TTL_FRIENDS = 60
TTL_STEAM_UPDATES = 900
TTL_GITHUB = 60
TTL_GITHUB_COMMITS = 120
TTL_STEAM_MONTHLY = 600
TTL_AVATARS = 60 * 60

STEAM_LIBRARY_GAMES_CHECKED = 15
STEAM_UPDATES_RETURNED = 10

REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")


class IntegrationError(Exception):
    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _get_json(url, params=None, headers=None):
    # Never include str(exception) in messages: requests puts the full URL
    # (including ?key=...) in it.
    try:
        r = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
    except requests.RequestException:
        raise IntegrationError("Upstream service unreachable.")
    if r.status_code in (401, 403):
        raise IntegrationError("Upstream rejected the credentials, or the data is private.", 400)
    if r.status_code == 404:
        raise IntegrationError("Not found upstream (check the name, or the resource may be private).", 404)
    if r.status_code == 429:
        raise IntegrationError("Upstream rate limit reached, try again later.")
    if not r.ok:
        raise IntegrationError(f"Upstream returned HTTP {r.status_code}.")
    try:
        return r.json()
    except ValueError:
        raise IntegrationError("Upstream returned invalid JSON.")


# Manual refresh from the dashboard: skip the cache, but never more often than
# FORCED_REFRESH_MIN_AGE seconds per key, so spamming the button can't burn API quotas.
FORCED_REFRESH_MIN_AGE = 10
_force_refresh = ContextVar("force_refresh", default=False)


@contextmanager
def force_refresh(enabled=True):
    token = _force_refresh.set(enabled)
    try:
        yield
    finally:
        _force_refresh.reset(token)


def _cached(key, ttl, fn, forceable=True):
    entry = cache.get(key)
    # Entries are (stored_at, value); anything else is from an older format.
    if isinstance(entry, tuple) and len(entry) == 2:
        stored_at, value = entry
        too_recent = time.time() - stored_at < FORCED_REFRESH_MIN_AGE
        if not (forceable and _force_refresh.get()) or too_recent:
            return value
    value = fn()
    cache.set(key, (time.time(), value), ttl)
    return value


def _require(value, label):
    if not value:
        raise IntegrationError(f"{label} is not configured.", 400)
    return value


# ----------------------------------------------------------------
def get_weather(city):
    _require(city, "Weather city")

    def geocode():
        data = _get_json(GEOCODING_URL, {"name": city, "count": 1, "language": "en", "format": "json"})
        results = data.get("results")
        if not results:
            raise IntegrationError(f"City '{city}' not found.", 400)
        return results[0]

    place = _cached(f"geo:{city.strip().lower()}", TTL_GEOCODE, geocode, forceable=False)

    def forecast():
        data = _get_json(FORECAST_URL, {
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                       "weather_code,wind_speed_10m,is_day",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min",
            "forecast_days": 1,
            "timezone": "auto",
        })
        daily = data.get("daily", {})
        today = {
            "date": daily["time"][0],
            "weather_code": daily["weather_code"][0],
            "temp_max": daily["temperature_2m_max"][0],
            "temp_min": daily["temperature_2m_min"][0],
        } if daily.get("time") else None
        return {
            "city": place.get("name"),
            "country": place.get("country"),
            "current": data.get("current"),
            "units": data.get("current_units"),
            "today": today,
        }

    return _cached(f"weather:{place['latitude']}:{place['longitude']}", TTL_WEATHER, forecast)


# ------------------------------------------------------------
def get_steam_friends(info):
    key = _require(info.steam_friends_api_key, "Steam friends API key")
    steam_id = _require(info.steam_id, "Steam ID")

    def fetch():
        data = _get_json(f"{STEAM}/ISteamUser/GetFriendList/v1/", {
            "key": key, "steamid": steam_id, "relationship": "friend",
        })
        ids = [f["steamid"] for f in data.get("friendslist", {}).get("friends", [])][:200]

        players = []
        for i in range(0, len(ids), 100):
            chunk = _get_json(f"{STEAM}/ISteamUser/GetPlayerSummaries/v2/", {
                "key": key, "steamids": ",".join(ids[i:i + 100]),
            })
            players.extend(chunk.get("response", {}).get("players", []))

        friends = [
            {
                "steam_id": p["steamid"],
                "name": p.get("personaname"),
                "avatar": p.get("avatarfull"),
                "profile_url": p.get("profileurl"),
                "status": p.get("personastate", 0),  # 0 offline, 1 online, 2 busy, 3 away, 4 snooze
                "game": p.get("gameextrainfo"),
                "game_id": p.get("gameid"),
                "last_logoff": p.get("lastlogoff"),
            }
            for p in players
        ]
        friends.sort(key=lambda f: (f["game"] is None, f["status"] == 0, -(f["last_logoff"] or 0)))
        return friends

    return _cached(f"steam_friends:{steam_id}", TTL_FRIENDS, fetch)


# -------------------------------------------------
def _latest_news(game):
    try:
        data = _get_json(f"{STEAM}/ISteamNews/GetNewsForApp/v2/", {
            "appid": game["appid"], "count": 1, "maxlength": 300,
            "feeds": "steam_community_announcements",
        })
    except IntegrationError:
        return None
    items = data.get("appnews", {}).get("newsitems", [])
    if not items:
        return None
    n = items[0]
    return {
        "app_id": game["appid"],
        "game": game.get("name"),
        "header_image": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{game['appid']}/header.jpg",
        "title": n.get("title"),
        "summary": n.get("contents"),
        "url": n.get("url"),
        "date": n.get("date"),
    }


def get_steam_updates(info):
    key = _require(info.steam_updates_api_key or info.steam_friends_api_key, "Steam updates API key")
    steam_id = _require(info.steam_id, "Steam ID")

    def fetch():
        data = _get_json(f"{STEAM}/IPlayerService/GetOwnedGames/v1/", {
            "key": key, "steamid": steam_id,
            "include_appinfo": 1, "include_played_free_games": 1,
        })
        games = data.get("response", {}).get("games")
        if not games:
            raise IntegrationError("Game library is empty or its details are private.", 400)

        games.sort(key=lambda g: g.get("rtime_last_played", 0), reverse=True)
        games = games[:STEAM_LIBRARY_GAMES_CHECKED]

        with ThreadPoolExecutor(max_workers=8) as pool:
            news = [n for n in pool.map(_latest_news, games) if n]
        news.sort(key=lambda n: n["date"] or 0, reverse=True)
        return news[:STEAM_UPDATES_RETURNED]

    return _cached(f"steam_updates:{steam_id}", TTL_STEAM_UPDATES, fetch)


# -------------------------------------------------
def get_steam_monthly_playtime(info, count):
    key = _require(info.steam_updates_api_key or info.steam_friends_api_key, "Steam API key")
    steam_id = _require(info.steam_id, "Steam ID")
    user = info.user

    def fetch():
        data = _get_json(f"{STEAM}/IPlayerService/GetOwnedGames/v1/", {
            "key": key, "steamid": steam_id, "include_appinfo": 1,
        })
        games = data.get("response", {}).get("games")
        if not games:
            raise IntegrationError("Game library is empty or its details are private.", 400)

        today = timezone.localdate()
        month_start = today.replace(day=1)
        snaps = SteamPlaytimeSnapshot.objects.filter(user=user)

        had_history = snaps.exists()
        tracked_since = snaps.order_by("date").values_list("date", flat=True).first() or today
        before_month, in_month = {}, {}
        for app_id, minutes in snaps.filter(date__lt=month_start).order_by("date") \
                                    .values_list("app_id", "playtime_forever"):
            before_month[app_id] = minutes
        for app_id, minutes in snaps.filter(date__gte=month_start).order_by("-date") \
                                    .values_list("app_id", "playtime_forever"):
            in_month[app_id] = minutes

        SteamPlaytimeSnapshot.objects.bulk_create(
            [SteamPlaytimeSnapshot(user=user, app_id=g["appid"], name=g.get("name", ""),
                                   playtime_forever=g.get("playtime_forever", 0), date=today)
             for g in games],
            update_conflicts=True,
            unique_fields=["user", "app_id", "date"],
            update_fields=["playtime_forever", "name"],
        )

        results = []
        for g in games:
            now = g.get("playtime_forever", 0)
            base = before_month.get(g["appid"], in_month.get(g["appid"]))
            if base is None:
                base = 0 if had_history else now
            minutes = max(now - base, 0)
            if minutes:
                results.append({
                    "app_id": g["appid"],
                    "name": g.get("name"),
                    "header_image": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{g['appid']}/header.jpg",
                    "minutes_this_month": minutes,
                    "hours_this_month": round(minutes / 60, 1),
                })
        results.sort(key=lambda r: r["minutes_this_month"], reverse=True)
        return {
            "month": month_start.strftime("%Y-%m"),
            "tracked_since": tracked_since.isoformat(),
            "games": results[:count],
        }

    return _cached(f"steam_month:{user.id}:{count}", TTL_STEAM_MONTHLY, fetch)


# ------------------------------------------------------------------
def _github_headers(token):
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _github_html_url(subject_type, api_url, repo_url):
    if api_url and subject_type in ("Issue", "PullRequest"):
        return (api_url
                .replace("https://api.github.com/repos/", "https://github.com/")
                .replace("/pulls/", "/pull/"))
    return repo_url


def get_github_notifications(token):
    _require(token, "GitHub token")

    def fetch():
        data = _get_json(
            GITHUB_NOTIFICATIONS_URL,
            params={"per_page": 30},
            headers=_github_headers(token),
        )
        return [
            {
                "id": n["id"],
                "unread": n["unread"],
                "reason": n["reason"],
                "title": n["subject"]["title"],
                "type": n["subject"]["type"],
                "repo": n["repository"]["full_name"],
                "url": _github_html_url(n["subject"]["type"], n["subject"].get("url"),
                                        n["repository"]["html_url"]),
                "updated_at": n["updated_at"],
            }
            for n in data
        ]

    return _cached(f"github:{hash(token)}", TTL_GITHUB, fetch)


def get_github_commits(info, repo, count):
    repo = _require((repo or "").strip(), "Repository")
    owner, _, name = repo.partition("/")
    if not REPO_RE.match(repo) or owner in (".", "..") or name in (".", ".."):
        raise IntegrationError("Repository must look like 'owner/name'.", 400)

    def fetch():
        data = _get_json(
            f"https://api.github.com/repos/{repo}/commits",
            params={"per_page": count},
            headers=_github_headers(info.github_token),
        )
        out = []
        for c in data:
            commit = c["commit"]
            gh_author = c.get("author") or {}
            out.append({
                "sha": c["sha"][:7],
                "message": commit["message"].split("\n", 1)[0],
                "author": commit["author"]["name"],
                "author_login": gh_author.get("login"),
                "avatar": gh_author.get("avatar_url"),
                "url": c["html_url"],
                "date": commit["author"]["date"],
            })
        return out

    return _cached(f"github_commits:{info.user_id}:{repo.lower()}:{count}", TTL_GITHUB_COMMITS, fetch)



# ------------------------------------------------------------------
def get_avatars(info):
    """Profile pictures shown in the widget card headers. A service that is not
    configured, or that fails, simply returns null: the card falls back to a letter."""
    out = {"steam": None, "steam_name": None, "github": None, "github_login": None}

    key = info.steam_friends_api_key or info.steam_updates_api_key
    if key and info.steam_id:
        def steam():
            data = _get_json(f"{STEAM}/ISteamUser/GetPlayerSummaries/v2/", {
                "key": key, "steamids": info.steam_id,
            })
            players = data.get("response", {}).get("players", [])
            p = players[0] if players else {}
            return {"avatar": p.get("avatarfull") or p.get("avatarmedium"), "name": p.get("personaname")}
        try:
            s = _cached(f"steam_avatar:{info.steam_id}", TTL_AVATARS, steam)
            out["steam"], out["steam_name"] = s["avatar"], s["name"]
        except IntegrationError:
            pass

    if info.github_token:
        def github():
            data = _get_json("https://api.github.com/user", headers=_github_headers(info.github_token))
            return {"avatar": data.get("avatar_url"), "login": data.get("login")}
        try:
            g = _cached(f"github_user:{hash(info.github_token)}", TTL_AVATARS, github)
            out["github"], out["github_login"] = g["avatar"], g["login"]
        except IntegrationError:
            pass

    return out
