"""Log in / sign up with Google or GitHub (OAuth 2.0 authorization code flow).

Flow:
  1. The front opens  GET /api/auth/<provider>/login            (full-page navigation)
  2. Django stores a random `state` in the session and redirects to the provider.
  3. The provider redirects to  GET /api/auth/<provider>/callback?code=...&state=...
  4. Django checks `state`, exchanges `code` for a token, reads the account (id, verified email),
     then logs the matching user in and redirects to the front.

Which user?
  - an account already linked to this Google/GitHub account;
  - otherwise, when linking from the settings, the logged-in user;
  - otherwise the user with the same *verified* email address;
  - otherwise a new user (already confirmed: the provider verified the email).
"""
import logging
import re
import secrets
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.decorators import login_not_required
from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponseRedirect
from django.views.decorators.http import require_GET

from .models import SocialAccount, UserApiInfo, UserProfile

logger = logging.getLogger(__name__)

TIMEOUT = 8
SESSION_KEY = "oauth_flow"
BACKEND = "api.auth_backends.EmailOrUsernameBackend"

PROVIDERS = {
    "google": {
        "name": "Google",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "openid email profile",
        "extra_params": {"prompt": "select_account"},
    },
    "github": {
        "name": "GitHub",
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        # notifications: lets the GitHub widgets use this token, no copy-paste needed
        "scope": "read:user user:email notifications",
        "extra_params": {"allow_signup": "true"},
    },
}


class OAuthError(Exception):
    """`code` is sent to the front, which shows a translated message."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def credentials(provider):
    client_id = settings.OAUTH_CLIENTS.get(provider, {}).get("client_id", "")
    client_secret = settings.OAUTH_CLIENTS.get(provider, {}).get("client_secret", "")
    return (client_id, client_secret) if client_id and client_secret else None


def enabled_providers():
    return [p for p in PROVIDERS if credentials(p)]


def redirect_uri(provider):
    return f"{settings.BACKEND_URL}/api/auth/{provider}/callback"


def _front(path, **query):
    url = f"{settings.FRONTEND_URL}{path}"
    return HttpResponseRedirect(f"{url}?{urlencode(query)}" if query else url)


# --------------------------------------------------------------------------------------------
# 1. Start
# --------------------------------------------------------------------------------------------
@login_not_required
@require_GET
def oauth_login(request, provider):
    if provider not in PROVIDERS:
        raise Http404
    creds = credentials(provider)
    linking = request.GET.get("mode") == "link"
    error_page = "/dashboard/settings" if linking else "/login"
    if not creds:
        return _front(error_page, oauth_error="not_configured")
    if linking and not request.user.is_authenticated:
        return _front("/login", oauth_error="session_expired")

    state = secrets.token_urlsafe(32)
    request.session[SESSION_KEY] = {
        "provider": provider,
        "state": state,
        "link_user_id": request.user.pk if linking else None,
    }
    conf = PROVIDERS[provider]
    params = {
        "client_id": creds[0],
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "scope": conf["scope"],
        "state": state,
        **conf["extra_params"],
    }
    return HttpResponseRedirect(f"{conf['authorize_url']}?{urlencode(params)}")


# --------------------------------------------------------------------------------------------
# 2. Callback
# --------------------------------------------------------------------------------------------
@login_not_required
@require_GET
def oauth_callback(request, provider):
    if provider not in PROVIDERS:
        raise Http404
    flow = request.session.pop(SESSION_KEY, None)
    linking = bool(flow and flow.get("link_user_id"))
    error_page = "/dashboard/settings" if linking else "/login"

    # The state proves this callback answers a login *we* started (protection against CSRF)
    if not flow or flow.get("provider") != provider or not secrets.compare_digest(
        flow.get("state", ""), request.GET.get("state", "")
    ):
        return _front("/login", oauth_error="invalid_state")
    if request.GET.get("error"):
        # The user clicked "Cancel" on the provider's page
        return _front(error_page, oauth_error="cancelled")
    if not request.GET.get("code"):
        return _front(error_page, oauth_error="failed")

    try:
        token = _exchange_code(provider, request.GET["code"])
        identity = FETCHERS[provider](token)
        with transaction.atomic():
            user, created = _resolve_user(request, provider, identity, flow.get("link_user_id"))
        if provider == "github":
            _save_github_token(user, token)
    except OAuthError as e:
        return _front(error_page, oauth_error=e.code)
    except (requests.RequestException, ValueError, KeyError):
        logger.exception("OAuth %s failed", provider)
        return _front(error_page, oauth_error="failed")

    login(request, user, backend=BACKEND)
    if linking:
        return _front("/dashboard/settings", oauth_linked=provider)
    return _front("/dashboard")


def _exchange_code(provider, code):
    client_id, client_secret = credentials(provider)
    r = requests.post(
        PROVIDERS[provider]["token_url"],
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri(provider),
            "grant_type": "authorization_code",
        },
        headers={"Accept": "application/json"},
        timeout=TIMEOUT,
    )
    data = r.json()
    token = data.get("access_token")
    if not r.ok or not token:
        raise OAuthError("failed")
    return token


def _google_identity(token):
    r = requests.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    info = r.json()
    return {
        "uid": str(info["sub"]),
        "email": info.get("email", "") if info.get("email_verified") else "",
        "login": info.get("email") or info.get("name", ""),
        "name_hint": info.get("given_name") or info.get("name") or "",
    }


def _github_identity(token):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    r = requests.get("https://api.github.com/user", headers=headers, timeout=TIMEOUT)
    r.raise_for_status()
    info = r.json()
    # The public profile email may be empty or unverified: ask for the verified primary one
    r = requests.get("https://api.github.com/user/emails", headers=headers, timeout=TIMEOUT)
    emails = r.json() if r.ok else []
    primary = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), "")
    return {
        "uid": str(info["id"]),
        "email": primary,
        "login": info.get("login", ""),
        "name_hint": info.get("login", ""),
    }


FETCHERS = {"google": _google_identity, "github": _github_identity}


def _resolve_user(request, provider, identity, link_user_id):
    User = get_user_model()
    account = SocialAccount.objects.select_related("user").filter(
        provider=provider, uid=identity["uid"]
    ).first()

    if link_user_id:
        user = User.objects.filter(pk=link_user_id, is_active=True).first()
        if user is None:
            raise OAuthError("session_expired")
        if account and account.user_id != user.pk:
            raise OAuthError("already_linked_other")
        if not account and SocialAccount.objects.filter(user=user, provider=provider).exists():
            raise OAuthError("provider_already_linked")
        if not account:
            _link(user, provider, identity)
        return user, False

    if account:
        if not account.user.is_active:
            # Only possible for an unconfirmed account: the provider vouches for the email
            account.user.is_active = True
            account.user.save(update_fields=["is_active"])
        return account.user, False

    email = identity["email"]
    if email:
        user = User.objects.filter(email__iexact=email).order_by("id").first()
        if user is not None:
            if SocialAccount.objects.filter(user=user, provider=provider).exists():
                raise OAuthError("provider_already_linked")
            if not user.is_active:
                user.is_active = True  # same address, verified by the provider
                user.save(update_fields=["is_active"])
            _link(user, provider, identity)
            return user, False
    else:
        # Without a verified email we can't create a usable account
        raise OAuthError("no_verified_email")

    user = User.objects.create_user(
        username=_unique_username(identity["name_hint"] or email.split("@")[0]),
        email=email,
        password=None,  # unusable password: this account logs in through the provider
    )
    UserProfile.objects.create(user=user)
    _link(user, provider, identity)
    return user, True


def _link(user, provider, identity):
    try:
        SocialAccount.objects.create(
            user=user, provider=provider, uid=identity["uid"],
            email=identity["email"], login=identity["login"][:255],
        )
    except IntegrityError:
        raise OAuthError("already_linked_other")


def _unique_username(hint):
    User = get_user_model()
    base = re.sub(r"[^\w.@+-]", "", hint)[:140] or "user"
    if len(base) < 3:
        base = f"{base}user"
    candidate, n = base, 1
    while User.objects.filter(username__iexact=candidate).exists():
        n += 1
        candidate = f"{base}{n}"
    return candidate


def _save_github_token(user, token):
    """The OAuth token has the `notifications` scope: reuse it for the GitHub widgets
    unless the user already saved a token by hand."""
    info, _ = UserApiInfo.objects.get_or_create(user=user)
    if not info.github_token:
        info.github_token = token
        info.save(update_fields=["github_token"])
