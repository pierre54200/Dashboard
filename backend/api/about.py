import time

from django.contrib.auth.decorators import login_not_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET

# Single source of truth for services/widgets. Param types: "string" or "integer" only.
SERVICES = [
    {
        "name": "weather",
        "widgets": [
            {
                "name": "current_weather",
                "description": "Current weather and today's high/low for a city",
                "params": [{"name": "city", "type": "string"}],
            },
        ],
    },
    {
        "name": "steam",
        "widgets": [
            {
                "name": "friends_activity",
                "description": "Friends currently in game, online, or last seen",
                "params": [
                    {"name": "limit", "type": "integer"},
                    {"name": "show", "type": "string"},
                ],
            },
            {
                "name": "latest_updates",
                "description": "Latest news for your recently played games, or for one game",
                "params": [
                    {"name": "count", "type": "integer"},
                    {"name": "game", "type": "string"},
                ],
            },
            {
                "name": "monthly_playtime",
                "description": "Most played games this month",
                "params": [{"name": "count", "type": "integer"}],
            },
            {
                "name": "achievements",
                "description": "Achievement progress for one game: last unlocked or still to get",
                "params": [
                    {"name": "game", "type": "string"},
                    {"name": "show", "type": "string"},
                    {"name": "count", "type": "integer"},
                ],
            },
            {
                "name": "deals",
                "description": "Current Steam store specials, or the price and discount of chosen games",
                "params": [
                    {"name": "games", "type": "string"},
                    {"name": "country", "type": "string"},
                    {"name": "count", "type": "integer"},
                ],
            },
        ],
    },
    {
        "name": "github",
        "widgets": [
            {
                "name": "notifications",
                "description": "Your latest GitHub notifications",
                "params": [
                    {"name": "count", "type": "integer"},
                    {"name": "filter", "type": "string"},
                ],
            },
            {
                "name": "recent_commits",
                "description": "Recent commits of a repository",
                "params": [
                    {"name": "repo", "type": "string"},
                    {"name": "count", "type": "integer"},
                ],
            },
        ],
    },
    {
        "name": "spotify",
        "widgets": [
            {
                "name": "now_playing",
                "description": "Track playing now, and the last tracks played",
                "params": [{"name": "history", "type": "integer"}],
            },
            {
                "name": "top_items",
                "description": "Your most listened tracks or artists over a period",
                "params": [
                    {"name": "type", "type": "string"},
                    {"name": "period", "type": "string"},
                    {"name": "count", "type": "integer"},
                ],
            },
            {
                "name": "playlists",
                "description": "Your playlists, or only the ones you created",
                "params": [
                    {"name": "owner", "type": "string"},
                    {"name": "count", "type": "integer"},
                ],
            },
        ],
    },
]


def _client_ip(request):
    # Only trust X-Forwarded-For if you run behind your own reverse proxy.
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


@login_not_required
@require_GET
def about_json(request):
    return JsonResponse({
        "client": {"host": _client_ip(request)},
        "server": {
            "current_time": int(time.time()),
            "services": SERVICES,
        },
    })
