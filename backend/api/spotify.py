"""Spotify service: account linking (OAuth 2.0 authorization code) and widget data.

Linking, from Settings > Services:
  1. The front opens   GET /api/services/spotify/connect   (full-page navigation, logged in)
  2. Django redirects to Spotify with a signed `state` naming the user.
  3. Spotify redirects to   GET /api/services/spotify/callback?code=...&state=...
  4. Django checks `state`, exchanges `code` for tokens, saves them on UserApiInfo,
     then redirects to the front (Settings > Services).

Why a signed state instead of the session: Spotify refuses "localhost" in redirect URIs and
requires the loopback IP (http://127.0.0.1:8080/...). The browser does not send the session
cookie of "localhost" to "127.0.0.1", so the callback identifies the user with the state:
signed with SECRET_KEY, valid 10 minutes, usable once.

Tokens: the access token lasts 1 hour; `access_token()` renews it with the refresh token.
"""
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth.decorators import login_not_required
from django.core import signing
from django.core.cache import cache
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.views.decorators.http import require_GET

from .integrations import IntegrationError, _cached
from .models import UserApiInfo

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API = "https://api.spotify.com/v1"
SCOPES = " ".join([
    "user-read-currently-playing",
    "user-read-recently-played",
    "user-top-read",
    "playlist-read-private",
    "playlist-read-collaborative",
])
TIMEOUT = 8
STATE_SALT = "api.spotify.state"
STATE_MAX_AGE = 600

TTL_NOW_PLAYING = 10
TTL_RECENT = 60
TTL_TOP = 30 * 60
TTL_PLAYLISTS = 10 * 60

TOP_TYPES = ("artists", "tracks")
TOP_PERIODS = ("short_term", "medium_term", "long_term")
PLAYLIST_OWNERS = ("all", "mine")


def credentials():
    if settings.SPOTIFY_CLIENT_ID and settings.SPOTIFY_CLIENT_SECRET:
        return settings.SPOTIFY_CLIENT_ID, settings.SPOTIFY_CLIENT_SECRET
    return None


def is_linked(info):
    return bool(info.spotify_refresh_token)


def unlink(info):
    info.spotify_access_token = info.spotify_refresh_token = ""
    info.spotify_token_expires = None
    info.spotify_user_id = info.spotify_display_name = info.spotify_avatar = ""
    info.save()


def _settings_page(**query):
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/dashboard/settings?{urlencode(query)}")


# --------------------------------------------------------------------------------------------
# Linking
# --------------------------------------------------------------------------------------------
@login_not_required
@require_GET
def spotify_connect(request):
    if not request.user.is_authenticated:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login")
    creds = credentials()
    if not creds:
        return _settings_page(service_error="not_configured")

    nonce = secrets.token_urlsafe(16)
    cache.set(f"spotify-state:{nonce}", request.user.pk, STATE_MAX_AGE)
    state = signing.dumps({"u": request.user.pk, "n": nonce}, salt=STATE_SALT)
    params = {
        "client_id": creds[0],
        "response_type": "code",
        "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "show_dialog": "true",  # lets the user pick another Spotify account
    }
    return HttpResponseRedirect(f"{AUTHORIZE_URL}?{urlencode(params)}")


def _user_from_state(state):
    try:
        data = signing.loads(state or "", salt=STATE_SALT, max_age=STATE_MAX_AGE)
    except signing.BadSignature:  # also raised when expired
        return None
    # Single use: a replayed callback URL is refused
    key = f"spotify-state:{data.get('n')}"
    if cache.get(key) != data.get("u"):
        return None
    cache.delete(key)
    return UserApiInfo.objects.get_or_create(user_id=data["u"])[0]


@login_not_required
@require_GET
def spotify_callback(request):
    info = _user_from_state(request.GET.get("state"))
    if info is None:
        return _settings_page(service_error="invalid_state")
    if request.GET.get("error"):
        return _settings_page(service_error="cancelled")
    if not request.GET.get("code") or not credentials():
        return _settings_page(service_error="failed")

    try:
        tokens = _token_request({
            "grant_type": "authorization_code",
            "code": request.GET["code"],
            "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
        })
        me = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"},
                          timeout=TIMEOUT)
    except (requests.RequestException, IntegrationError, KeyError):
        logger.exception("Spotify linking failed")
        return _settings_page(service_error="failed")
    if me.status_code == 403:
        # Development Mode: the Spotify account must be listed in the app's users
        return _settings_page(service_error="not_allowed")
    if not me.ok:
        return _settings_page(service_error="failed")

    profile = me.json()
    images = profile.get("images") or []
    _store_tokens(info, tokens)
    info.spotify_user_id = profile.get("id", "")
    info.spotify_display_name = (profile.get("display_name") or profile.get("id") or "")[:255]
    info.spotify_avatar = (images[0].get("url") if images else "") or ""
    info.save()
    return _settings_page(service_linked="spotify")


# --------------------------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------------------------
def _token_request(data):
    client_id, client_secret = credentials() or ("", "")
    r = requests.post(TOKEN_URL, data=data, auth=(client_id, client_secret), timeout=TIMEOUT)
    if r.status_code == 400 and data["grant_type"] == "refresh_token":
        raise IntegrationError("Spotify account is not configured.", 400)  # revoked by the user
    if not r.ok:
        raise IntegrationError(f"Upstream returned HTTP {r.status_code}.")
    return r.json()


def _store_tokens(info, tokens):
    info.spotify_access_token = tokens["access_token"]
    # Spotify only sometimes sends a new refresh token
    info.spotify_refresh_token = tokens.get("refresh_token") or info.spotify_refresh_token
    info.spotify_token_expires = timezone.now() + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60)


def access_token(info, renew=False):
    if not is_linked(info):
        raise IntegrationError("Spotify account is not configured.", 400)
    expired = not info.spotify_token_expires or info.spotify_token_expires <= timezone.now()
    if renew or expired or not info.spotify_access_token:
        try:
            tokens = _token_request({"grant_type": "refresh_token", "refresh_token": info.spotify_refresh_token})
        except IntegrationError as e:
            if e.status_code == 400:
                unlink(info)  # access revoked on Spotify's side: ask to link again
            raise
        except requests.RequestException:
            raise IntegrationError("Upstream service unreachable.")
        _store_tokens(info, tokens)
        info.save(update_fields=["spotify_access_token", "spotify_refresh_token", "spotify_token_expires"])
    return info.spotify_access_token


def _get(info, path, params=None):
    """GET on the Web API. Returns None for 204 (nothing playing). Renews the token once on 401."""
    for attempt in range(2):
        token = access_token(info, renew=attempt == 1)
        try:
            r = requests.get(f"{API}{path}", params=params, headers={"Authorization": f"Bearer {token}"},
                             timeout=TIMEOUT)
        except requests.RequestException:
            raise IntegrationError("Upstream service unreachable.")
        if r.status_code == 401 and attempt == 0:
            continue
        break
    if r.status_code == 204:
        return None
    if r.status_code == 403:
        raise IntegrationError("Spotify refused access: add your Spotify account to the app's users.", 400)
    if r.status_code == 429:
        raise IntegrationError("Upstream rate limit reached, try again later.")
    if not r.ok:
        raise IntegrationError(f"Upstream returned HTTP {r.status_code}.")
    try:
        return r.json()
    except ValueError:
        raise IntegrationError("Upstream returned invalid JSON.")


# --------------------------------------------------------------------------------------------
# Widget data
# --------------------------------------------------------------------------------------------
def _image(images, min_size=64):
    """Smallest image at least `min_size` wide (Spotify lists them from largest to smallest)."""
    images = images or []
    fitting = [i for i in images if (i.get("width") or 0) >= min_size]
    chosen = fitting[-1] if fitting else (images[0] if images else None)
    return chosen.get("url") if chosen else None


def _track(t):
    if not t:
        return None
    album = t.get("album") or t.get("show") or {}
    artists = t.get("artists") or ([{"name": album.get("name")}] if t.get("type") == "episode" else [])
    return {
        "id": t.get("id"),
        "name": t.get("name"),
        "artists": ", ".join(a.get("name", "") for a in artists if a.get("name")),
        "album": album.get("name"),
        "image": _image(album.get("images") or t.get("images")),
        "url": (t.get("external_urls") or {}).get("spotify"),
        "duration_ms": t.get("duration_ms"),
        "type": t.get("type", "track"),
    }


def get_now_playing(info, history=3):
    """Track playing now (or None) and the `history` last played tracks."""
    uid = info.user_id

    def playing():
        data = _get(info, "/me/player/currently-playing", {"additional_types": "track,episode"})
        if not data or not data.get("item"):
            return None
        return {**_track(data["item"]), "is_playing": bool(data.get("is_playing")),
                "progress_ms": data.get("progress_ms")}

    now = _cached(f"spotify_now:{uid}", TTL_NOW_PLAYING, playing)
    recent = []
    if history:
        def fetch_recent():
            data = _get(info, "/me/player/recently-played", {"limit": 10}) or {}
            return [{**_track(i.get("track")), "played_at": i.get("played_at")} for i in data.get("items", [])]
        recent = _cached(f"spotify_recent:{uid}", TTL_RECENT, fetch_recent)
        if now:  # don't list the playing track twice
            recent = [t for t in recent if t["id"] != now["id"]]
    return {"playing": now, "recent": recent[:history]}


def get_top(info, kind="tracks", period="short_term", count=5):
    def fetch():
        data = _get(info, f"/me/top/{kind}", {"time_range": period, "limit": 50}) or {}
        out = []
        for i in data.get("items", []):
            if kind == "artists":
                out.append({
                    "id": i.get("id"),
                    "name": i.get("name"),
                    "subtitle": ", ".join((i.get("genres") or [])[:2]),
                    "image": _image(i.get("images")),
                    "url": (i.get("external_urls") or {}).get("spotify"),
                })
            else:
                t = _track(i)
                out.append({"id": t["id"], "name": t["name"], "subtitle": t["artists"],
                            "image": t["image"], "url": t["url"]})
        return out

    return _cached(f"spotify_top:{info.user_id}:{kind}:{period}", TTL_TOP, fetch)[:count]


def get_playlists(info, owner="all", count=5):
    def fetch():
        data = _get(info, "/me/playlists", {"limit": 50}) or {}
        out = []
        for p in data.get("items") or []:
            if not p:
                continue
            # February 2026: "tracks" was renamed "items" in playlist objects
            content = p.get("items") if isinstance(p.get("items"), dict) else p.get("tracks") or {}
            out.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "image": _image(p.get("images")),
                "url": (p.get("external_urls") or {}).get("spotify"),
                "owner": (p.get("owner") or {}).get("display_name"),
                "owner_id": (p.get("owner") or {}).get("id"),
                "tracks": content.get("total"),
                "public": p.get("public"),
                "collaborative": bool(p.get("collaborative")),
            })
        return out

    playlists = _cached(f"spotify_playlists:{info.user_id}", TTL_PLAYLISTS, fetch)
    if owner == "mine":
        playlists = [p for p in playlists if p["owner_id"] == info.spotify_user_id]
    return playlists[:count]
