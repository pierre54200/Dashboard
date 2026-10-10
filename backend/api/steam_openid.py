""""Sign in through Steam": Steam ID verified by Steam (OpenID 2.0).

Steam has no OAuth: its login window uses the old OpenID 2.0 protocol, which only proves
which Steam account signed in (its Steam ID). It does not give an API key. With
STEAM_API_KEY in .env, that Steam ID is enough for the widgets.

  1. The front opens   GET /api/services/steam/connect          (full-page navigation, logged in)
  2. Django redirects to steamcommunity.com/openid/login, with a nonce kept in the session.
  3. Steam redirects to  GET /api/services/steam/callback?nonce=...&openid.*=...
  4. Django sends these parameters back to Steam (check_authentication). Steam answers
     "is_valid:true" only if it signed the response itself: a Steam ID can't be forged.
     The Steam ID is saved, then back to Settings > Services.

Unlike Spotify, Steam accepts "localhost": the session cookie is sent to the callback.
"""
import logging
import re
import secrets
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth.decorators import login_not_required
from django.http import HttpResponseRedirect
from django.views.decorators.http import require_GET

from .models import UserApiInfo

logger = logging.getLogger(__name__)

OPENID_URL = "https://steamcommunity.com/openid/login"
OPENID_NS = "http://specs.openid.net/auth/2.0"
IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select"
CLAIMED_ID_RE = re.compile(r"^https://steamcommunity\.com/openid/id/(7656119\d{10})$")
SESSION_KEY = "steam_openid_nonce"
TIMEOUT = 8


def _settings_page(**query):
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/dashboard/settings?{urlencode(query)}")


def _return_to(nonce):
    return f"{settings.BACKEND_URL}/api/services/steam/callback?{urlencode({'nonce': nonce})}"


@login_not_required
@require_GET
def steam_connect(request):
    if not request.user.is_authenticated:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login")
    nonce = secrets.token_urlsafe(16)
    request.session[SESSION_KEY] = nonce
    params = {
        "openid.ns": OPENID_NS,
        "openid.mode": "checkid_setup",
        "openid.return_to": _return_to(nonce),
        "openid.realm": settings.BACKEND_URL,
        "openid.identity": IDENTIFIER_SELECT,
        "openid.claimed_id": IDENTIFIER_SELECT,
    }
    return HttpResponseRedirect(f"{OPENID_URL}?{urlencode(params)}")


def _verified_steam_id(request):
    """Steam ID if Steam confirms this response, otherwise None."""
    params = {k: v for k, v in request.GET.items() if k.startswith("openid.")}
    if params.get("openid.mode") != "id_res":
        return None
    # The response must come from Steam and be meant for us
    if params.get("openid.op_endpoint") != OPENID_URL:
        return None
    if params.get("openid.return_to") != _return_to(request.GET.get("nonce", "")):
        return None
    match = CLAIMED_ID_RE.match(params.get("openid.claimed_id", ""))
    if not match:
        return None
    # Ask Steam itself whether it signed this response
    r = requests.post(OPENID_URL, data={**params, "openid.mode": "check_authentication"}, timeout=TIMEOUT)
    if not r.ok or "is_valid:true" not in r.text:
        return None
    return match.group(1)


@login_not_required
@require_GET
def steam_callback(request):
    expected = request.session.pop(SESSION_KEY, None)
    if not request.user.is_authenticated:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login?oauth_error=session_expired")
    if not expected or not secrets.compare_digest(expected, request.GET.get("nonce", "")):
        return _settings_page(service_error="invalid_state")
    if request.GET.get("openid.mode") == "cancel":
        return _settings_page(service_error="cancelled")

    try:
        steam_id = _verified_steam_id(request)
    except requests.RequestException:
        logger.exception("Steam OpenID check failed")
        return _settings_page(service_error="failed")
    if not steam_id:
        return _settings_page(service_error="failed")

    info, _ = UserApiInfo.objects.get_or_create(user=request.user)
    info.steam_id = steam_id
    info.save(update_fields=["steam_id", "updated_at"])
    return _settings_page(service_linked="steam")
