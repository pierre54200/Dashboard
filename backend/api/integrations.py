import hashlib
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
STORE = "https://store.steampowered.com/api"
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
TTL_LIBRARY = 900
TTL_ACHIEVEMENTS = 600
TTL_STORE = 1800

# Steam's language names, for achievement names and descriptions
STEAM_LANGUAGES = {"fr": "french", "en": "english"}
# Store countries offered in the widget (they set the currency)
STORE_COUNTRIES = ("fr", "us", "gb", "ch", "ca", "jp")
ACHIEVEMENT_FILTERS = ("recent", "locked")
STORE_WATCHLIST_MAX = 5

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
FRIEND_FILTERS = ("all", "online", "in_game")


def get_steam_friends(info, limit=10, show="all"):
    """`show`: all, online (not offline) or in_game. The full list is cached once,
    each widget instance then filters and cuts it."""
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

    friends = _cached(f"steam_friends:{steam_id}", TTL_FRIENDS, fetch)
    if show == "online":
        friends = [f for f in friends if f["status"] != 0]
    elif show == "in_game":
        friends = [f for f in friends if f["game"]]
    return friends[:limit]


# -------------------------------------------------
def _news(game, count=1):
    try:
        data = _get_json(f"{STEAM}/ISteamNews/GetNewsForApp/v2/", {
            "appid": game["appid"], "count": count, "maxlength": 300,
            "feeds": "steam_community_announcements",
        })
    except IntegrationError:
        return []
    return [
        {
            "id": str(n.get("gid") or f"{game['appid']}-{n.get('date')}"),
            "app_id": game["appid"],
            "game": game.get("name"),
            "header_image": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{game['appid']}/header.jpg",
            "title": n.get("title"),
            "summary": n.get("contents"),
            "url": n.get("url"),
            "date": n.get("date"),
        }
        for n in data.get("appnews", {}).get("newsitems", [])
    ]


def _latest_news(game):
    news = _news(game, 1)
    return news[0] if news else None


def _find_game(games, name):
    """Exact name first, then the most recently played game whose name contains `name`."""
    wanted = name.casefold()
    exact = [g for g in games if (g.get("name") or "").casefold() == wanted]
    if exact:
        return exact[0]
    partial = [g for g in games if wanted in (g.get("name") or "").casefold()]
    partial.sort(key=lambda g: g.get("rtime_last_played", 0), reverse=True)
    return partial[0] if partial else None


def get_steam_updates(info, count=5, game=""):
    """Without `game`: the newest announcement of each recently played game.
    With `game` (name or part of it): the `count` latest announcements of that game."""
    key = _require(info.steam_updates_api_key or info.steam_friends_api_key, "Steam updates API key")
    steam_id = _require(info.steam_id, "Steam ID")
    game = (game or "").strip()

    def library():
        data = _get_json(f"{STEAM}/IPlayerService/GetOwnedGames/v1/", {
            "key": key, "steamid": steam_id,
            "include_appinfo": 1, "include_played_free_games": 1,
        })
        games = data.get("response", {}).get("games")
        if not games:
            raise IntegrationError("Game library is empty or its details are private.", 400)
        return games

    if game:
        def fetch_game():
            found = _find_game(library(), game)
            if found is None:
                raise IntegrationError(f"Game '{game}' not found in your library.", 400)
            return _news(found, STEAM_UPDATES_RETURNED)

        news = _cached(
            f"steam_updates:{steam_id}:{_key(game)}",
            TTL_STEAM_UPDATES, fetch_game,
        )
        return news[:count]

    def fetch():
        games = library()
        games.sort(key=lambda g: g.get("rtime_last_played", 0), reverse=True)
        games = games[:STEAM_LIBRARY_GAMES_CHECKED]

        with ThreadPoolExecutor(max_workers=8) as pool:
            news = [n for n in pool.map(_latest_news, games) if n]
        news.sort(key=lambda n: n["date"] or 0, reverse=True)
        return news[:STEAM_UPDATES_RETURNED]

    return _cached(f"steam_updates:{steam_id}", TTL_STEAM_UPDATES, fetch)[:count]


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


# -------------------------------------------------
def _key(text):
    """Cache key part for free text (memcached refuses spaces and long keys)."""
    return hashlib.sha1(text.casefold().encode()).hexdigest()


def _owned_games(key, steam_id):
    def fetch():
        data = _get_json(f"{STEAM}/IPlayerService/GetOwnedGames/v1/", {
            "key": key, "steamid": steam_id,
            "include_appinfo": 1, "include_played_free_games": 1,
        })
        games = data.get("response", {}).get("games")
        if not games:
            raise IntegrationError("Game library is empty or its details are private.", 400)
        return games
    return _cached(f"steam_library:{steam_id}", TTL_LIBRARY, fetch, forceable=False)


def get_steam_achievements(info, game, language="fr"):
    """Every achievement of one game of the library, with the user's progress.
    Names and descriptions come in the user's language when the game is translated."""
    key = _require(info.steam_updates_api_key or info.steam_friends_api_key, "Steam API key")
    steam_id = _require(info.steam_id, "Steam ID")
    game = _require((game or "").strip(), "Game")

    found = _find_game(_owned_games(key, steam_id), game)
    if found is None:
        raise IntegrationError(f"Game '{game}' not found in your library.", 400)
    app_id = found["appid"]
    lang = STEAM_LANGUAGES.get(language, "english")

    def fetch():
        try:
            player = _get_json(f"{STEAM}/ISteamUserStats/GetPlayerAchievements/v1/", {
                "key": key, "steamid": steam_id, "appid": app_id, "l": lang,
            })
        except IntegrationError as e:
            if e.message == "Upstream returned HTTP 400.":
                # Steam answers 400 "Requested app has no stats"
                raise IntegrationError("This game has no achievements.", 400)
            raise
        mine = {a["apiname"]: a for a in player.get("playerstats", {}).get("achievements") or []}
        if not mine:
            raise IntegrationError("This game has no achievements.", 400)

        # Icons only exist in the schema; without it the widget still works, without images
        try:
            schema = _get_json(f"{STEAM}/ISteamUserStats/GetSchemaForGame/v2/", {
                "key": key, "appid": app_id, "l": lang,
            })
            definitions = schema.get("game", {}).get("availableGameStats", {}).get("achievements") or []
        except IntegrationError:
            definitions = []
        defs = {d["name"]: d for d in definitions}
        order = [d["name"] for d in definitions if d["name"] in mine] + [n for n in mine if n not in defs]

        achievements = []
        for name in order:
            a, d = mine[name], defs.get(name, {})
            unlocked = bool(a.get("achieved"))
            achievements.append({
                "api_name": name,
                "name": a.get("name") or d.get("displayName") or name,
                "description": a.get("description") or d.get("description") or "",
                "icon": d.get("icon") if unlocked else (d.get("icongray") or d.get("icon")),
                "unlocked": unlocked,
                "unlock_time": a.get("unlocktime") or None if unlocked else None,
                "hidden": bool(d.get("hidden")),
            })
        return {
            "app_id": app_id,
            "game": found.get("name"),
            "header_image": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg",
            "total": len(achievements),
            "unlocked": sum(a["unlocked"] for a in achievements),
            "achievements": achievements,
        }

    return _cached(f"steam_achievements:{steam_id}:{app_id}:{lang}", TTL_ACHIEVEMENTS, fetch)


def _store_item(app_id, name, image, currency, initial, final, expiration=None, is_free=False):
    discount = round((initial - final) * 100 / initial) if initial and final is not None and final < initial else 0
    return {
        "app_id": app_id,
        "name": name,
        "image": image,
        "url": f"https://store.steampowered.com/app/{app_id}/",
        "currency": currency,
        "original_price": initial,  # cents, null for a free game
        "final_price": final,
        "discount_percent": discount,
        "discount_expiration": expiration,
        "is_free": is_free,
    }


def _store_price(name, country):
    data = _get_json(f"{STORE}/storesearch/", {"term": name, "cc": country, "l": "english"})
    items = [i for i in data.get("items") or [] if i.get("type", "app") == "app"]
    if not items:
        raise IntegrationError(f"Game '{name}' not found on the Steam store.", 400)
    wanted = name.casefold()
    item = next((i for i in items if (i.get("name") or "").casefold() == wanted), items[0])
    price = item.get("price")
    image = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{item['id']}/header.jpg"
    if not price:
        return _store_item(item["id"], item.get("name"), image, None, None, None, is_free=True)
    return _store_item(item["id"], item.get("name"), image, price.get("currency"),
                       price.get("initial"), price.get("final"))


def get_steam_deals(games="", country="fr", count=5):
    """Without `games`: the store's current specials. With `games` (names separated by
    commas, up to 5): the price and discount of each of them. Public store API, no key."""
    names = [g.strip() for g in (games or "").split(",") if g.strip()][:STORE_WATCHLIST_MAX]

    if names:
        return [
            _cached(f"steam_price:{country}:{_key(name)}", TTL_STORE, lambda name=name: _store_price(name, country))
            for name in names
        ][:count]

    def fetch():
        data = _get_json(f"{STORE}/featuredcategories", {"cc": country, "l": "english"})
        out, seen = [], set()
        for i in data.get("specials", {}).get("items") or []:
            if not i.get("discounted") or i["id"] in seen:
                continue
            seen.add(i["id"])
            out.append(_store_item(
                i["id"], i.get("name"), i.get("header_image") or i.get("large_capsule_image"),
                i.get("currency"), i.get("original_price"), i.get("final_price"),
                i.get("discount_expiration"),
            ))
        out.sort(key=lambda d: d["discount_percent"], reverse=True)
        return out

    return _cached(f"steam_specials:{country}", TTL_STORE, fetch)[:count]


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


NOTIFICATION_FILTERS = ("unread", "all", "participating")


def get_github_notifications(token, count=10, filter="unread"):
    """`filter`: unread (GitHub's default), all (read ones too) or participating
    (only threads where you are directly involved: mention, review, assignment...)."""
    _require(token, "GitHub token")
    params = {"per_page": 50}
    if filter == "all":
        params["all"] = "true"
    elif filter == "participating":
        params["participating"] = "true"

    def fetch():
        data = _get_json(
            GITHUB_NOTIFICATIONS_URL,
            params=params,
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

    return _cached(f"github:{hash(token)}:{filter}", TTL_GITHUB, fetch)[:count]


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
