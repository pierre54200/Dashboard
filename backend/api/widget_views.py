from django.contrib.auth.decorators import login_not_required
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import integrations, spotify
from .integrations import IntegrationError
from .models import UserApiInfo, UserProfile
from .serializer import (
    AvatarsSerializer,
    ErrorSerializer,
    GithubCommitSerializer,
    GithubNotificationSerializer,
    SteamFriendSerializer,
    SpotifyNowPlayingSerializer,
    SpotifyPlaylistSerializer,
    SpotifyTopItemSerializer,
    SteamAchievementsSerializer,
    SteamDealSerializer,
    SteamMonthlyPlaytimeSerializer,
    SteamUpdateSerializer,
    WeatherResponseSerializer,
)

WIDGETS = ["Widgets data"]


def _errors(not_configured):
    return [
        OpenApiExample("Not configured", value={"error": not_configured},
                       response_only=True, status_codes=["400"]),
        OpenApiExample("Upstream failure", value={"error": "Upstream service unreachable."},
                       response_only=True, status_codes=["502"]),
    ]


def _info(request):
    info, _ = UserApiInfo.objects.get_or_create(user=request.user)
    return info


def _int_param(request, name, default, lo, hi):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except ValueError:
        raise IntegrationError(f"'{name}' must be an integer.", 400)
    if not lo <= value <= hi:
        raise IntegrationError(f"'{name}' must be between {lo} and {hi}.", 400)
    return value


def _choice_param(request, name, choices):
    """First choice is the default."""
    value = request.query_params.get(name) or choices[0]
    if value not in choices:
        raise IntegrationError(f"'{name}' must be one of: {', '.join(choices)}.", 400)
    return value


def _text_param(request, name, max_length=100):
    return (request.query_params.get(name) or "").strip()[:max_length]


def _run(request, fn):
    """`?refresh=1` (manual refresh button) bypasses the server cache."""
    forced = request.query_params.get("refresh") in ("1", "true")
    try:
        with integrations.force_refresh(forced):
            return Response(fn())
    except IntegrationError as e:
        return Response({"error": e.message}, status=e.status_code)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Current weather and today's high/low",
    description="Uses the `city` query parameter, or the saved weather city (Open-Meteo). Cached 10 min.",
    parameters=[OpenApiParameter("city", str, OpenApiParameter.QUERY, required=False,
                                 description="City for this widget instance")],
    responses={200: WeatherResponseSerializer, 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value={
                "city": "Paris",
                "country": "France",
                "current": {
                    "time": "2026-10-08T14:00",
                    "interval": 900,
                    "temperature_2m": 17.4,
                    "apparent_temperature": 16.1,
                    "relative_humidity_2m": 62,
                    "weather_code": 3,
                    "wind_speed_10m": 11.2,
                    "is_day": 1,
                },
                "units": {
                    "temperature_2m": "°C",
                    "apparent_temperature": "°C",
                    "relative_humidity_2m": "%",
                    "wind_speed_10m": "km/h",
                },
                "today": {"date": "2026-10-08", "weather_code": 3, "temp_max": 18.2, "temp_min": 10.5},
            },
            response_only=True,
            status_codes=["200"],
        ),
        *_errors("Weather city is not configured."),
    ],
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_weather(request):
    # A widget instance can ask for its own city; otherwise use the saved one.
    city = request.query_params.get("city", "").strip()[:100]
    return _run(request, lambda: integrations.get_weather(city or _info(request).weather_city))


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Steam friends activity",
    description="Params: `limit` (1-50, default 10), `show` (`all`, `online` or `in_game`, default `all`). "
                "Friends sorted: in game, online, then last seen. Needs a public friends list. Cached 1 min.",
    parameters=[
        OpenApiParameter("limit", int, required=False, description="1-50, default 10"),
        OpenApiParameter("show", str, required=False, enum=["all", "online", "in_game"], description="default all"),
    ],
    responses={200: SteamFriendSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value=[
                {
                    "steam_id": "76561198000000001",
                    "name": "Alice",
                    "avatar": "https://avatars.steamstatic.com/abc_full.jpg",
                    "profile_url": "https://steamcommunity.com/id/alice/",
                    "status": 1,
                    "game": "Counter-Strike 2",
                    "game_id": "730",
                    "last_logoff": 1759930000,
                },
                {
                    "steam_id": "76561198000000002",
                    "name": "Bob",
                    "avatar": "https://avatars.steamstatic.com/def_full.jpg",
                    "profile_url": "https://steamcommunity.com/profiles/76561198000000002/",
                    "status": 0,
                    "game": None,
                    "game_id": None,
                    "last_logoff": 1759900000,
                },
            ],
            response_only=True,
            status_codes=["200"],
        ),
        *_errors("Steam ID is not configured."),
    ],
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_steam_friends(request):
    def run():
        limit = _int_param(request, "limit", 10, 1, 50)
        show = _choice_param(request, "show", integrations.FRIEND_FILTERS)
        return integrations.get_steam_friends(_info(request), limit, show)
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Latest news/updates for recently played library games",
    description="Params: `count` (1-10, default 5), `game` (optional, name or part of the name of a game in "
                "the library). Without `game`: newest announcement of each recently played game. With `game`: "
                "the latest announcements of that game. Cached 15 min.",
    parameters=[
        OpenApiParameter("count", int, required=False, description="1-10, default 5"),
        OpenApiParameter("game", str, required=False, description="e.g. Counter-Strike 2"),
    ],
    responses={200: SteamUpdateSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value=[
                {
                    "id": "5123456789012345678",
                    "app_id": 730,
                    "game": "Counter-Strike 2",
                    "header_image": "https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg",
                    "title": "Release Notes for 10/7/2026",
                    "summary": "[ MAPS ] Updated lighting on Inferno...",
                    "url": "https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1234567890",
                    "date": 1759870000,
                }
            ],
            response_only=True,
            status_codes=["200"],
        ),
        *_errors("Steam updates API key is not configured."),
    ],
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_steam_updates(request):
    def run():
        count = _int_param(request, "count", 5, 1, 10)
        return integrations.get_steam_updates(_info(request), count, _text_param(request, "game"))
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="GitHub notifications",
    description="Params: `count` (1-50, default 10), `filter` (`unread`, `all` or `participating`, "
                "default `unread`). Uses the saved token (or the one from the GitHub login). Cached 1 min.",
    parameters=[
        OpenApiParameter("count", int, required=False, description="1-50, default 10"),
        OpenApiParameter("filter", str, required=False, enum=["unread", "all", "participating"],
                         description="default unread"),
    ],
    responses={200: GithubNotificationSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value=[
                {
                    "id": "1234567890",
                    "unread": True,
                    "reason": "review_requested",
                    "title": "Fix login redirect",
                    "type": "PullRequest",
                    "repo": "octocat/hello-world",
                    "url": "https://github.com/octocat/hello-world/pull/42",
                    "updated_at": "2026-10-08T09:30:00Z",
                }
            ],
            response_only=True,
            status_codes=["200"],
        ),
        *_errors("GitHub token is not configured."),
    ],
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_github_notifications(request):
    def run():
        count = _int_param(request, "count", 10, 1, 50)
        flt = _choice_param(request, "filter", integrations.NOTIFICATION_FILTERS)
        return integrations.get_github_notifications(_info(request).github_token, count, flt)
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Recent commits of a repository",
    description="Params: `repo` (owner/name), `count` (1-20, default 5). Uses the saved GitHub token if any "
                "(required for private repos). Cached 2 min.",
    parameters=[
        OpenApiParameter("repo", str, required=True, description="e.g. octocat/hello-world"),
        OpenApiParameter("count", int, required=False, description="1-20, default 5"),
    ],
    responses={200: GithubCommitSerializer(many=True), 400: ErrorSerializer, 404: ErrorSerializer, 502: ErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_github_commits(request):
    def run():
        count = _int_param(request, "count", 5, 1, 20)
        return integrations.get_github_commits(_info(request), request.query_params.get("repo"), count)
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Most played games this month",
    description="Params: `count` (1-10, default 3). Playtime is computed from daily snapshots of lifetime "
                "playtime, since Steam has no monthly endpoint. Needs public game details. Cached 10 min.",
    parameters=[OpenApiParameter("count", int, required=False, description="1-10, default 3")],
    responses={200: SteamMonthlyPlaytimeSerializer, 400: ErrorSerializer, 502: ErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_steam_monthly_playtime(request):
    def run():
        count = _int_param(request, "count", 3, 1, 10)
        return integrations.get_steam_monthly_playtime(_info(request), count)
    return _run(request, run)



@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Achievements of one game",
    description="Params: `game` (required, name or part of the name of a game in the library), "
                "`show` (`recent`: last unlocked, or `locked`: still to get; default `recent`), "
                "`count` (1-20, default 6). `total` and `unlocked` always cover the whole game. "
                "Names are in the user's language when available. Needs public game details. Cached 10 min.",
    parameters=[
        OpenApiParameter("game", str, required=True, description="e.g. Hollow Knight"),
        OpenApiParameter("show", str, required=False, enum=["recent", "locked"], description="default recent"),
        OpenApiParameter("count", int, required=False, description="1-20, default 6"),
    ],
    responses={200: SteamAchievementsSerializer, 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value={
                "app_id": 367520, "game": "Hollow Knight",
                "header_image": "https://cdn.cloudflare.steamstatic.com/steam/apps/367520/header.jpg",
                "total": 63, "unlocked": 21,
                "achievements": [{
                    "api_name": "FALSE_KNIGHT", "name": "Test of Resolve", "description": "Defeat the False Knight",
                    "icon": "https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/367520/x.jpg",
                    "unlocked": True, "unlock_time": 1759800000, "hidden": False,
                }],
            },
            response_only=True, status_codes=["200"],
        ),
        OpenApiExample("No achievements", value={"error": "This game has no achievements."},
                       response_only=True, status_codes=["400"]),
        *_errors("Steam ID is not configured."),
    ],
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_steam_achievements(request):
    def run():
        show = _choice_param(request, "show", integrations.ACHIEVEMENT_FILTERS)
        count = _int_param(request, "count", 6, 1, 20)
        profile = UserProfile.objects.filter(user=request.user).first()
        data = integrations.get_steam_achievements(
            _info(request), _text_param(request, "game"), profile.language if profile else "fr",
        )
        items = data["achievements"]
        if show == "recent":
            items = sorted((a for a in items if a["unlocked"]), key=lambda a: a["unlock_time"] or 0, reverse=True)
        else:
            items = [a for a in items if not a["unlocked"]]
        return {**data, "achievements": items[:count]}
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Steam store specials, or the price of chosen games",
    description="Params: `games` (optional, up to 5 names separated by commas), `country` (`fr`, `us`, `gb`, "
                "`ch`, `ca` or `jp`, default `fr`: sets the currency), `count` (1-10, default 5). Without "
                "`games`: the biggest discounts of the moment. Prices are in cents (null for a free game). "
                "Public store API, no Steam account needed. Cached 30 min.",
    parameters=[
        OpenApiParameter("games", str, required=False, description="e.g. Hollow Knight, Hades"),
        OpenApiParameter("country", str, required=False, enum=list(integrations.STORE_COUNTRIES),
                         description="default fr"),
        OpenApiParameter("count", int, required=False, description="1-10, default 5"),
    ],
    responses={200: SteamDealSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value=[{
                "app_id": 1091500, "name": "Cyberpunk 2077",
                "image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg",
                "url": "https://store.steampowered.com/app/1091500/", "currency": "EUR",
                "original_price": 5999, "final_price": 1799, "discount_percent": 70,
                "discount_expiration": 1791478800, "is_free": False,
            }],
            response_only=True, status_codes=["200"],
        ),
        OpenApiExample("Unknown game", value={"error": "Game 'Hollow Knigt 3' not found on the Steam store."},
                       response_only=True, status_codes=["400"]),
    ],
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_steam_deals(request):
    def run():
        country = _choice_param(request, "country", integrations.STORE_COUNTRIES)
        count = _int_param(request, "count", 5, 1, 10)
        return integrations.get_steam_deals(_text_param(request, "games", 300), country, count)
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Spotify: track playing now and last played",
    description="Params: `history` (0-10, default 3): number of recently played tracks shown under the "
                "current one. `playing` is null when nothing plays. Needs a linked Spotify account "
                "(Settings > Services). Cached 10 s (playing) and 1 min (history).",
    parameters=[OpenApiParameter("history", int, required=False, description="0-10, default 3")],
    responses={200: SpotifyNowPlayingSerializer, 400: ErrorSerializer, 502: ErrorSerializer},
    examples=_errors("Spotify account is not configured."),
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_spotify_now_playing(request):
    def run():
        return spotify.get_now_playing(_info(request), _int_param(request, "history", 3, 0, 10))
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Spotify: your top artists or tracks",
    description="Params: `type` (`tracks` or `artists`, default `tracks`), `period` (`short_term` about "
                "4 weeks, `medium_term` about 6 months, `long_term` about a year; default `short_term`), "
                "`count` (1-20, default 5). Cached 30 min.",
    parameters=[
        OpenApiParameter("type", str, required=False, enum=list(spotify.TOP_TYPES), description="default tracks"),
        OpenApiParameter("period", str, required=False, enum=list(spotify.TOP_PERIODS),
                         description="default short_term"),
        OpenApiParameter("count", int, required=False, description="1-20, default 5"),
    ],
    responses={200: SpotifyTopItemSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=_errors("Spotify account is not configured."),
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_spotify_top(request):
    def run():
        kind = _choice_param(request, "type", spotify.TOP_TYPES)
        period = _choice_param(request, "period", spotify.TOP_PERIODS)
        return spotify.get_top(_info(request), kind, period, _int_param(request, "count", 5, 1, 20))
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Spotify: your playlists",
    description="Params: `owner` (`all`, or `mine` for the playlists you created; default `all`), "
                "`count` (1-20, default 5). Cached 10 min.",
    parameters=[
        OpenApiParameter("owner", str, required=False, enum=list(spotify.PLAYLIST_OWNERS), description="default all"),
        OpenApiParameter("count", int, required=False, description="1-20, default 5"),
    ],
    responses={200: SpotifyPlaylistSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=_errors("Spotify account is not configured."),
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_spotify_playlists(request):
    def run():
        owner = _choice_param(request, "owner", spotify.PLAYLIST_OWNERS)
        return spotify.get_playlists(_info(request), owner, _int_param(request, "count", 5, 1, 20))
    return _run(request, run)


@login_not_required
@extend_schema(
    tags=["Settings"],
    summary="Unlink the Spotify account",
    description="To link one, open GET /api/services/spotify/connect in the browser (full-page navigation).",
    responses={204: None},
)
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def spotify_unlink(request):
    spotify.unlink(_info(request))
    return Response(status=204)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Profile pictures for the widget headers",
    description="Steam avatar (needs Steam ID + key) and GitHub avatar (needs a token). "
                "Missing or failing services return null instead of an error. Cached 1 h.",
    responses={200: AvatarsSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def widget_avatars(request):
    return Response(integrations.get_avatars(_info(request)))
