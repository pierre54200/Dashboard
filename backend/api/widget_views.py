from django.contrib.auth.decorators import login_not_required
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import integrations
from .integrations import IntegrationError
from .models import UserApiInfo
from .serializer import (
    ErrorSerializer,
    GithubNotificationSerializer,
    SteamFriendSerializer,
    SteamUpdateSerializer,
    WeatherResponseSerializer,
)

WIDGETS = ["Widgets data"]


def _errors(not_configured):
    """Shared 400/502 examples."""
    return [
        OpenApiExample("Not configured", value={"error": not_configured},
                       response_only=True, status_codes=["400"]),
        OpenApiExample("Upstream failure", value={"error": "Upstream service unreachable."},
                       response_only=True, status_codes=["502"]),
    ]


def _info(request):
    info, _ = UserApiInfo.objects.get_or_create(user=request.user)
    return info


def _run(fn):
    try:
        return Response(fn())
    except IntegrationError as e:
        return Response({"error": e.message}, status=e.status_code)


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Current weather and today's high/low",
    description="Uses the saved weather city (Open-Meteo). Cached 10 min.",
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
    return _run(lambda: integrations.get_weather(_info(request).weather_city))


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Steam friends activity",
    description="Friends sorted: in game, online, then last seen. Needs a public friends list. Cached 1 min.",
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
    return _run(lambda: integrations.get_steam_friends(_info(request)))


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="Latest news/updates for recently played library games",
    description="Newest announcement across the user's most recently played games. Cached 15 min.",
    responses={200: SteamUpdateSerializer(many=True), 400: ErrorSerializer, 502: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Success",
            value=[
                {
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
    return _run(lambda: integrations.get_steam_updates(_info(request)))


@login_not_required
@extend_schema(
    tags=WIDGETS,
    summary="GitHub notifications",
    description="Unread notifications for the saved token. Cached 1 min.",
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
    return _run(lambda: integrations.get_github_notifications(_info(request).github_token))