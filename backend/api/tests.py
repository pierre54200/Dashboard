import re
from datetime import timedelta
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import integrations
from .models import SocialAccount, UserApiInfo, UserProfile

OAUTH = {
    "google": {"client_id": "gid", "client_secret": "gsecret"},
    "github": {"client_id": "hid", "client_secret": "hsecret"},
}


def link_from(message):
    return re.search(r"https?://\S+/confirm-email\?\S+", message.body).group(0)


class RegistrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(SERVER_NAME="localhost")

    def register(self, **extra):
        data = {"username": "alice", "email": "alice@example.com", "password": "Motdepasse!42", **extra}
        return self.client.post("/api/users/register", data, format="json")

    def confirm(self, link):
        q = parse_qs(urlparse(link).query)
        return self.client.post("/api/users/confirm", {"uid": q["uid"][0], "token": q["token"][0]}, format="json")

    def test_register_creates_inactive_user_and_sends_email(self):
        r = self.register(language="en")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["detail"], "confirmation_sent")
        user = User.objects.get(username="alice")
        self.assertFalse(user.is_active)
        self.assertEqual(user.profile.language, "en")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Confirm your email", mail.outbox[0].subject)
        self.assertIn("http://localhost:4200/confirm-email?uid=", mail.outbox[0].body)
        # Not logged in yet
        self.assertEqual(self.client.get("/api/users/me").status_code, 404)

    def test_login_before_confirmation_is_refused_with_clear_code(self):
        self.register()
        r = self.client.post("/api/users/login", {"username": "alice", "password": "Motdepasse!42"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data["code"], "email_not_confirmed")
        # A wrong password doesn't reveal that the account exists
        r = self.client.post("/api/users/login", {"username": "alice", "password": "wrong"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_confirmation_link_activates_and_logs_in_once(self):
        self.register()
        link = link_from(mail.outbox[0])
        r = self.confirm(link)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(User.objects.get(username="alice").is_active)
        self.assertEqual(self.client.get("/api/users/me").status_code, 200)
        # The same link no longer works once used
        self.assertEqual(APIClient(SERVER_NAME="localhost").post(
            "/api/users/confirm",
            {k: v[0] for k, v in parse_qs(urlparse(link).query).items()}, format="json",
        ).status_code, 400)

    def test_tampered_token_is_rejected(self):
        self.register()
        q = parse_qs(urlparse(link_from(mail.outbox[0])).query)
        r = self.client.post("/api/users/confirm", {"uid": q["uid"][0], "token": "abc-123"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(User.objects.get(username="alice").is_active)

    def test_resend_is_silent_and_rate_limited(self):
        self.register()
        mail.outbox.clear()
        for _ in range(3):
            r = self.client.post("/api/users/confirm/resend", {"email": "ALICE@example.com"}, format="json")
            self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        r = self.client.post("/api/users/confirm/resend", {"email": "nobody@example.com"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_login_with_email_or_username(self):
        User.objects.create_user("bob", "Bob@Example.com", "Motdepasse!42")
        for identifier in ("bob", "bob@example.com", "BOB@EXAMPLE.COM"):
            client = APIClient(SERVER_NAME="localhost")
            r = client.post("/api/users/login", {"username": identifier, "password": "Motdepasse!42"}, format="json")
            self.assertEqual(r.status_code, 202, identifier)
        r = self.client.post("/api/users/login", {"username": "bob@example.com", "password": "nope"}, format="json")
        self.assertEqual(r.status_code, 400)


class FakeResponse:
    def __init__(self, data, status=200):
        self._data, self.status_code = data, status
        self.ok = status < 400

    @property
    def text(self):
        return "" if self._data is None else str(self._data)

    def json(self):
        return self._data

    def raise_for_status(self):
        if not self.ok:
            raise __import__("requests").HTTPError(str(self.status_code))


def fake_github(uid=42, login="octo", email="octo@example.com", verified=True):
    def post(url, **kw):
        assert kw["data"]["code"] == "good-code"
        return FakeResponse({"access_token": "gho_token"})

    def get(url, **kw):
        if url.endswith("/user"):
            return FakeResponse({"id": uid, "login": login})
        return FakeResponse([{"email": email, "primary": True, "verified": verified}])
    return post, get


def fake_google(sub="g-1", email="gina@example.com", verified=True):
    def post(url, **kw):
        return FakeResponse({"access_token": "ya29.token"})

    def get(url, **kw):
        return FakeResponse({"sub": sub, "email": email, "email_verified": verified, "given_name": "Gina"})
    return post, get


@override_settings(OAUTH_CLIENTS=OAUTH)
class OAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient(SERVER_NAME="localhost")

    def start(self, provider, mode=None):
        r = self.client.get(f"/api/auth/{provider}/login" + ("?mode=link" if mode else ""))
        self.assertEqual(r.status_code, 302)
        q = parse_qs(urlparse(r["Location"]).query)
        return r["Location"], q.get("state", [""])[0]

    def callback(self, provider, state, fakes, code="good-code"):
        post, get = fakes
        with mock.patch("api.oauth.requests.post", side_effect=post), \
             mock.patch("api.oauth.requests.get", side_effect=get):
            return self.client.get(f"/api/auth/{provider}/callback", {"code": code, "state": state})

    def test_providers_listed_only_when_configured(self):
        self.assertEqual([p["id"] for p in self.client.get("/api/auth/providers").data], ["google", "github"])
        with override_settings(OAUTH_CLIENTS={"github": OAUTH["github"]}):
            self.assertEqual([p["id"] for p in self.client.get("/api/auth/providers").data], ["github"])

    def test_login_redirects_to_provider_with_state(self):
        url, state = self.start("github")
        self.assertTrue(url.startswith("https://github.com/login/oauth/authorize?"))
        self.assertIn("redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fapi%2Fauth%2Fgithub%2Fcallback", url)
        self.assertTrue(len(state) > 20)

    def test_new_github_user_is_created_logged_in_and_token_reused(self):
        _, state = self.start("github")
        r = self.callback("github", state, fake_github())
        self.assertEqual(r["Location"], "http://localhost:4200/dashboard")
        user = User.objects.get(email="octo@example.com")
        self.assertTrue(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.username, "octo")
        self.assertEqual(UserApiInfo.objects.get(user=user).github_token, "gho_token")
        self.assertTrue(UserProfile.objects.filter(user=user).exists())
        self.assertEqual(self.client.get("/api/users/me").data["username"], "octo")

    def test_existing_user_with_same_verified_email_is_linked_not_duplicated(self):
        existing = User.objects.create_user("gina", "Gina@example.com", "Motdepasse!42")
        _, state = self.start("google")
        self.callback("google", state, fake_google())
        self.assertEqual(User.objects.filter(email__iexact="gina@example.com").count(), 1)
        self.assertTrue(SocialAccount.objects.filter(user=existing, provider="google").exists())
        # Next time, the link is used directly
        self.client = APIClient(SERVER_NAME="localhost")
        _, state = self.start("google")
        r = self.callback("google", state, fake_google())
        self.assertEqual(r["Location"], "http://localhost:4200/dashboard")
        self.assertEqual(self.client.get("/api/users/me").data["id"], existing.id)

    def test_unconfirmed_account_is_activated_by_provider_with_same_email(self):
        user = User.objects.create_user("gina", "gina@example.com", "Motdepasse!42", is_active=False)
        _, state = self.start("google")
        self.callback("google", state, fake_google())
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_unverified_email_is_never_used_to_match_or_create(self):
        User.objects.create_user("victim", "victim@example.com", "Motdepasse!42")
        _, state = self.start("github")
        r = self.callback("github", state, fake_github(email="victim@example.com", verified=False))
        self.assertIn("oauth_error=no_verified_email", r["Location"])
        self.assertFalse(SocialAccount.objects.exists())

    def test_bad_state_is_rejected(self):
        self.start("github")
        r = self.callback("github", "forged-state", fake_github())
        self.assertIn("oauth_error=invalid_state", r["Location"])
        self.assertFalse(User.objects.filter(email="octo@example.com").exists())

    def test_cancel_on_provider_page(self):
        _, state = self.start("google")
        r = self.client.get("/api/auth/google/callback", {"error": "access_denied", "state": state})
        self.assertEqual(r["Location"], "http://localhost:4200/login?oauth_error=cancelled")

    def test_link_from_settings_then_unlink(self):
        user = User.objects.create_user("pierre", "pierre@example.com", "Motdepasse!42")
        self.client.force_login(user)
        _, state = self.start("github", mode="link")
        r = self.callback("github", state, fake_github(email="other@example.com"))
        self.assertEqual(r["Location"], "http://localhost:4200/dashboard/settings?oauth_linked=github")
        data = self.client.get("/api/users/me/connections").data
        github = next(p for p in data["providers"] if p["id"] == "github")
        self.assertTrue(github["linked"])
        self.assertEqual(github["account"], "octo")
        r = self.client.delete("/api/users/me/connections/github")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(SocialAccount.objects.filter(user=user).exists())

    def test_cannot_link_an_account_already_used_by_someone_else(self):
        owner = User.objects.create_user("owner", "owner@example.com", "x-Motdepasse!42")
        SocialAccount.objects.create(user=owner, provider="github", uid="42", login="octo")
        me = User.objects.create_user("me", "me@example.com", "Motdepasse!42")
        self.client.force_login(me)
        _, state = self.start("github", mode="link")
        r = self.callback("github", state, fake_github())
        self.assertIn("oauth_error=already_linked_other", r["Location"])
        self.assertEqual(SocialAccount.objects.get(uid="42").user, owner)

    def test_last_login_method_cannot_be_unlinked(self):
        _, state = self.start("github")
        self.callback("github", state, fake_github())
        r = self.client.delete("/api/users/me/connections/github")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "keep_one")

    def test_unknown_provider_is_404(self):
        self.assertEqual(self.client.get("/api/auth/facebook/login").status_code, 404)


class PasswordChangeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("carol", "carol@example.com", "Ancien-Mdp42")
        self.client = APIClient(SERVER_NAME="localhost")
        self.client.force_login(self.user)

    def post(self, **data):
        return self.client.post("/api/users/me/password", data, format="json")

    def test_change_keeps_session_and_logs_out_other_devices(self):
        other = APIClient(SERVER_NAME="localhost")
        other.force_login(self.user)
        r = self.post(current_password="Ancien-Mdp42", new_password="Nouveau-Mdp42!")
        self.assertEqual(r.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Nouveau-Mdp42!"))
        self.assertEqual(self.client.get("/api/users/me").status_code, 200)
        self.assertNotEqual(other.get("/api/users/me").status_code, 200)

    def test_wrong_or_missing_current_password(self):
        self.assertIn("current_password", self.post(new_password="Nouveau-Mdp42!").data)
        r = self.post(current_password="faux", new_password="Nouveau-Mdp42!")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["current_password"][0], "Current password is incorrect.")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Ancien-Mdp42"))

    def test_weak_password_is_refused(self):
        for weak in ("123", "12345678", "password", "carol123"):
            r = self.post(current_password="Ancien-Mdp42", new_password=weak)
            self.assertEqual(r.status_code, 400, weak)
            self.assertIn("new_password", r.data)

    def test_too_many_wrong_attempts(self):
        for _ in range(5):
            self.post(current_password="faux", new_password="Nouveau-Mdp42!")
        r = self.post(current_password="Ancien-Mdp42", new_password="Nouveau-Mdp42!")
        self.assertEqual(r.status_code, 429)

    def test_oauth_account_can_set_a_first_password(self):
        oauth_user = User.objects.create_user("octo", "octo@example.com", None)
        client = APIClient(SERVER_NAME="localhost")
        client.force_login(oauth_user)
        self.assertFalse(client.get("/api/users/me/profile").data["info"]["has_password"])
        r = client.post("/api/users/me/password", {"new_password": "Premier-Mdp42!"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(client.get("/api/users/me/profile").data["info"]["has_password"])
        r = APIClient(SERVER_NAME="localhost").post(
            "/api/users/login", {"username": "octo@example.com", "password": "Premier-Mdp42!"}, format="json")
        self.assertEqual(r.status_code, 202)


class WidgetParamsTests(TestCase):
    """The three widgets that used to have no settings."""

    FRIENDS = [
        {"steamid": "1", "personaname": "Joueur", "personastate": 1, "gameextrainfo": "CS2", "lastlogoff": 5},
        {"steamid": "2", "personaname": "EnLigne", "personastate": 1, "lastlogoff": 4},
        {"steamid": "3", "personaname": "Absent", "personastate": 3, "lastlogoff": 3},
        {"steamid": "4", "personaname": "Parti", "personastate": 0, "lastlogoff": 2},
    ]
    GAMES = [
        {"appid": 730, "name": "Counter-Strike 2", "rtime_last_played": 10},
        {"appid": 570, "name": "Dota 2", "rtime_last_played": 20},
    ]

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("dave", "dave@example.com", "Motdepasse!42")
        UserApiInfo.objects.create(user=self.user, steam_id="76561198000000000",
                                   steam_friends_api_key="k", github_token="t")
        self.client = APIClient(SERVER_NAME="localhost")
        self.client.force_login(self.user)
        self.calls = []

    def fake_get_json(self, url, params=None, headers=None):
        self.calls.append((url, params or {}))
        if "GetFriendList" in url:
            return {"friendslist": {"friends": [{"steamid": f["steamid"]} for f in self.FRIENDS]}}
        if "GetPlayerSummaries" in url:
            return {"response": {"players": self.FRIENDS}}
        if "GetOwnedGames" in url:
            return {"response": {"games": [dict(g) for g in self.GAMES]}}
        if "GetNewsForApp" in url:
            return {"appnews": {"newsitems": [
                {"gid": f"{params['appid']}-{i}", "title": f"News {i}", "contents": "x", "url": "https://s/x", "date": 100 - i}
                for i in range(params["count"])
            ]}}
        if "notifications" in url:
            n = {"id": "1", "unread": True, "reason": "mention", "updated_at": "2026-10-10T00:00:00Z",
                 "subject": {"title": "T", "type": "Issue", "url": None},
                 "repository": {"full_name": "a/b", "html_url": "https://github.com/a/b"}}
            return [dict(n, id=str(i)) for i in range(20)]
        raise AssertionError(url)

    def get(self, url, **params):
        with mock.patch("api.integrations._get_json", side_effect=self.fake_get_json):
            return self.client.get(url, params)

    def test_friends_filter_and_limit(self):
        names = lambda r: [f["name"] for f in r.data]
        self.assertEqual(names(self.get("/api/widgets/steam/friends")), ["Joueur", "EnLigne", "Absent", "Parti"])
        self.assertEqual(names(self.get("/api/widgets/steam/friends", show="online")), ["Joueur", "EnLigne", "Absent"])
        self.assertEqual(names(self.get("/api/widgets/steam/friends", show="in_game")), ["Joueur"])
        self.assertEqual(names(self.get("/api/widgets/steam/friends", limit=2)), ["Joueur", "EnLigne"])
        self.assertEqual(self.get("/api/widgets/steam/friends", show="nope").status_code, 400)
        self.assertEqual(self.get("/api/widgets/steam/friends", limit=0).status_code, 400)

    def test_updates_count_and_game(self):
        r = self.get("/api/widgets/steam/updates", count=1)
        self.assertEqual(len(r.data), 1)
        r = self.get("/api/widgets/steam/updates", game="counter", count=3)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([n["app_id"] for n in r.data], [730, 730, 730])
        self.assertEqual(len({n["id"] for n in r.data}), 3)
        r = self.get("/api/widgets/steam/updates", game="Half-Life 3")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["error"], "Game 'Half-Life 3' not found in your library.")

    def test_notifications_count_and_filter(self):
        r = self.get("/api/widgets/github/notifications", count=5)
        self.assertEqual(len(r.data), 5)
        self.get("/api/widgets/github/notifications", filter="all")
        self.get("/api/widgets/github/notifications", filter="participating")
        sent = [p for u, p in self.calls if "notifications" in u]
        self.assertNotIn("all", sent[0])
        self.assertEqual(sent[1].get("all"), "true")
        self.assertEqual(sent[2].get("participating"), "true")
        self.assertEqual(self.get("/api/widgets/github/notifications", filter="x").status_code, 400)

    def test_about_json_lists_the_new_params(self):
        services = {s["name"]: s for s in self.client.get("/about.json").json()["server"]["services"]}
        for service in services.values():
            for widget in service["widgets"]:
                self.assertTrue(widget["params"], widget["name"])


class NewSteamWidgetsTests(TestCase):
    GAMES = [
        {"appid": 367520, "name": "Hollow Knight", "rtime_last_played": 10},
        {"appid": 570, "name": "Dota 2", "rtime_last_played": 20},
        {"appid": 999, "name": "The Binding of Isaac: Rebirth", "rtime_last_played": 5},
    ]

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("fred", "fred@example.com", "Motdepasse!42")
        UserProfile.objects.create(user=self.user, language="fr")
        UserApiInfo.objects.create(user=self.user, steam_id="76561198000000000", steam_friends_api_key="k")
        self.client = APIClient(SERVER_NAME="localhost")
        self.client.force_login(self.user)
        self.calls = []

    def fake(self, url, params=None, headers=None):
        self.calls.append((url, params or {}))
        if "GetOwnedGames" in url:
            return {"response": {"games": [dict(g) for g in self.GAMES]}}
        if "GetPlayerAchievements" in url:
            if params["appid"] == 570:
                raise integrations.IntegrationError("Upstream returned HTTP 400.")
            if params["appid"] == 999:
                raise integrations.IntegrationError("Upstream rejected the credentials, or the data is private.", 400)
            return {"playerstats": {"success": True, "achievements": [
                {"apiname": "A", "achieved": 1, "unlocktime": 100, "name": "Premier", "description": "d"},
                {"apiname": "B", "achieved": 0, "unlocktime": 0, "name": "Deuxième", "description": "d"},
                {"apiname": "C", "achieved": 1, "unlocktime": 300, "name": "Troisième", "description": "d"},
            ]}}
        if "GetSchemaForGame" in url:
            return {"game": {"availableGameStats": {"achievements": [
                {"name": n, "displayName": n, "icon": f"https://i/{n}.jpg", "icongray": f"https://i/{n}_g.jpg", "hidden": 0}
                for n in ("A", "B", "C")
            ]}}}
        if "featuredcategories" in url:
            return {"specials": {"items": [
                {"id": 1, "name": "Petite promo", "discounted": True, "original_price": 1000, "final_price": 900,
                 "currency": "EUR", "header_image": "https://h/1.jpg", "discount_expiration": 5},
                {"id": 2, "name": "Grosse promo", "discounted": True, "original_price": 4000, "final_price": 1000,
                 "currency": "EUR", "header_image": "https://h/2.jpg", "discount_expiration": 5},
                {"id": 2, "name": "Grosse promo", "discounted": True, "original_price": 4000, "final_price": 1000,
                 "currency": "EUR", "header_image": "https://h/2.jpg"},
                {"id": 3, "name": "Pas en promo", "discounted": False, "original_price": 2000, "final_price": 2000,
                 "currency": "EUR", "header_image": "https://h/3.jpg"},
            ]}}
        if "storesearch" in url:
            term = params["term"].lower()
            if "hollow" in term:
                return {"items": [{"type": "app", "id": 367520, "name": "Hollow Knight",
                                   "price": {"currency": "USD" if params["cc"] == "us" else "EUR", "initial": 1479, "final": 739}}]}
            if "dota" in term:
                return {"items": [{"type": "app", "id": 570, "name": "Dota 2"}]}
            return {"total": 0, "items": []}
        raise AssertionError(url)

    def get(self, url, **params):
        with mock.patch("api.integrations._get_json", side_effect=self.fake):
            return self.client.get(url, params)

    def test_achievements_recent_and_locked(self):
        r = self.get("/api/widgets/steam/achievements", game="hollow")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data["total"], r.data["unlocked"]), (3, 2))
        self.assertEqual([a["name"] for a in r.data["achievements"]], ["Troisième", "Premier"])
        self.assertEqual(r.data["achievements"][0]["icon"], "https://i/C.jpg")
        r = self.get("/api/widgets/steam/achievements", game="hollow", show="locked")
        self.assertEqual([(a["name"], a["icon"]) for a in r.data["achievements"]], [("Deuxième", "https://i/B_g.jpg")])
        r = self.get("/api/widgets/steam/achievements", game="hollow", count=1)
        self.assertEqual(len(r.data["achievements"]), 1)
        # Names asked in the user's language
        self.assertEqual(next(p for u, p in self.calls if "GetPlayerAchievements" in u)["l"], "french")

    def test_achievements_errors(self):
        self.assertEqual(self.get("/api/widgets/steam/achievements").data["error"], "Game is not configured.")
        self.assertEqual(self.get("/api/widgets/steam/achievements", game="Portal 3").data["error"],
                         "Game 'Portal 3' not found in your library.")
        self.assertEqual(self.get("/api/widgets/steam/achievements", game="dota").data["error"],
                         "This game has no achievements.")
        self.assertEqual(self.get("/api/widgets/steam/achievements", game="isaac").data["error"],
                         "Achievements are private: set your Steam game details to public.")

    def test_specials_sorted_deduplicated_and_cut(self):
        r = self.get("/api/widgets/steam/deals")
        self.assertEqual([d["name"] for d in r.data], ["Grosse promo", "Petite promo"])
        self.assertEqual(r.data[0]["discount_percent"], 75)
        self.assertEqual(len(self.get("/api/widgets/steam/deals", count=1).data), 1)

    def test_watchlist_prices(self):
        r = self.get("/api/widgets/steam/deals", games="Hollow Knight, Dota 2", country="us")
        self.assertEqual(r.status_code, 200)
        hk, dota = r.data
        self.assertEqual((hk["currency"], hk["final_price"], hk["discount_percent"]), ("USD", 739, 50))
        self.assertTrue(dota["is_free"])
        self.assertEqual(self.get("/api/widgets/steam/deals", games="zzz").data["error"],
                         "Game 'zzz' not found on the Steam store.")
        self.assertEqual(self.get("/api/widgets/steam/deals", country="xx").status_code, 400)


SPOTIFY = {"SPOTIFY_CLIENT_ID": "sid", "SPOTIFY_CLIENT_SECRET": "ssecret",
           "SPOTIFY_REDIRECT_URI": "http://127.0.0.1:8080/api/services/spotify/callback"}


@override_settings(**SPOTIFY)
class SpotifyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("hana", "hana@example.com", "Motdepasse!42")
        self.client = APIClient(SERVER_NAME="localhost")
        self.client.force_login(self.user)
        self.posts, self.gets = [], []
        self.me_status = 200
        self.playing = True

    # ---- fake Spotify
    def fake_post(self, url, data=None, auth=None, timeout=None):
        self.posts.append(data)
        assert auth == ("sid", "ssecret")
        if data["grant_type"] == "authorization_code":
            return FakeResponse({"access_token": "acc1", "refresh_token": "ref1", "expires_in": 3600})
        if data["refresh_token"] == "revoked":
            return FakeResponse({"error": "invalid_grant"}, 400)
        return FakeResponse({"access_token": "acc2", "expires_in": 3600})

    def fake_get(self, url, params=None, headers=None, timeout=None):
        self.gets.append((url, params, headers))
        img = [{"url": "https://i/640.jpg", "width": 640}, {"url": "https://i/64.jpg", "width": 64}]
        track = lambda n: {"id": f"t{n}", "name": f"Titre {n}", "type": "track", "duration_ms": 200000,
                           "artists": [{"name": "Artiste"}], "album": {"name": "Album", "images": img},
                           "external_urls": {"spotify": f"https://open.spotify.com/track/t{n}"}}
        if url.endswith("/me"):
            return FakeResponse({"id": "hana_sp", "display_name": "Hana", "images": img}, self.me_status)
        if url.endswith("/currently-playing"):
            if not self.playing:
                return FakeResponse(None, 204)
            return FakeResponse({"is_playing": True, "progress_ms": 1000, "item": track(1)})
        if url.endswith("/recently-played"):
            return FakeResponse({"items": [{"track": track(i), "played_at": "2026-10-10T20:00:00Z"} for i in (1, 2, 3, 4)]})
        if "/me/top/artists" in url:
            return FakeResponse({"items": [{"id": f"a{i}", "name": f"Artiste {i}", "genres": ["rap", "pop", "rock"],
                                            "images": img, "external_urls": {}} for i in range(8)]})
        if "/me/top/tracks" in url:
            return FakeResponse({"items": [track(i) for i in range(8)]})
        if url.endswith("/me/playlists"):
            return FakeResponse({"items": [
                {"id": "p1", "name": "À moi", "owner": {"id": "hana_sp", "display_name": "Hana"},
                 "items": {"total": 12}, "images": img, "public": True, "external_urls": {}},
                {"id": "p2", "name": "Suivie", "owner": {"id": "autre", "display_name": "Autre"},
                 "tracks": {"total": 40}, "images": None, "public": True, "external_urls": {}},
            ]})
        raise AssertionError(url)

    def patched(self):
        return mock.patch.multiple("api.spotify.requests", post=mock.DEFAULT, get=mock.DEFAULT)

    def link(self):
        r = self.client.get("/api/services/spotify/connect")
        self.assertEqual(r.status_code, 302)
        q = parse_qs(urlparse(r["Location"]).query)
        self.assertEqual(q["redirect_uri"][0], SPOTIFY["SPOTIFY_REDIRECT_URI"])
        # The callback comes back on 127.0.0.1: no session cookie, the signed state identifies the user
        anonymous = APIClient(SERVER_NAME="127.0.0.1")
        with self.patched() as m:
            m["post"].side_effect, m["get"].side_effect = self.fake_post, self.fake_get
            return anonymous.get("/api/services/spotify/callback", {"code": "c", "state": q["state"][0]}), q["state"][0]

    def widget(self, path, **params):
        with self.patched() as m:
            m["post"].side_effect, m["get"].side_effect = self.fake_post, self.fake_get
            return self.client.get(path, params)

    # ---- tests
    def test_link_stores_tokens_and_profile(self):
        r, state = self.link()
        self.assertEqual(r["Location"], "http://localhost:4200/dashboard/settings?service_linked=spotify")
        info = UserApiInfo.objects.get(user=self.user)
        self.assertEqual((info.spotify_access_token, info.spotify_refresh_token), ("acc1", "ref1"))
        self.assertEqual((info.spotify_display_name, info.spotify_avatar), ("Hana", "https://i/640.jpg"))
        data = self.client.get("/api/users/me/integrations").data
        self.assertTrue(data["has_spotify"])
        self.assertNotIn("spotify_access_token", data)
        # The same callback URL can't be replayed
        r = APIClient(SERVER_NAME="127.0.0.1").get("/api/services/spotify/callback", {"code": "c", "state": state})
        self.assertIn("service_error=invalid_state", r["Location"])

    def test_forged_state_and_not_allowed_user(self):
        r = APIClient(SERVER_NAME="127.0.0.1").get("/api/services/spotify/callback", {"code": "c", "state": "x"})
        self.assertIn("service_error=invalid_state", r["Location"])
        self.me_status = 403
        r, _ = self.link()
        self.assertIn("service_error=not_allowed", r["Location"])
        self.assertFalse(UserApiInfo.objects.get(user=self.user).spotify_refresh_token)

    def test_not_configured(self):
        with override_settings(SPOTIFY_CLIENT_ID=""):
            r = self.client.get("/api/services/spotify/connect")
        self.assertIn("service_error=not_configured", r["Location"])
        self.assertEqual(self.widget("/api/widgets/spotify/top").data["error"], "Spotify account is not configured.")

    def test_now_playing_history_and_token_refresh(self):
        self.link()
        info = UserApiInfo.objects.get(user=self.user)
        info.spotify_token_expires = timezone.now() - timedelta(minutes=1)
        info.save()
        r = self.widget("/api/widgets/spotify/now-playing", history=2)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["playing"]["name"], "Titre 1")
        self.assertEqual(r.data["playing"]["image"], "https://i/64.jpg")
        self.assertEqual([t["id"] for t in r.data["recent"]], ["t2", "t3"])  # the playing one isn't repeated
        self.assertEqual(UserApiInfo.objects.get(user=self.user).spotify_access_token, "acc2")
        cache.clear()
        self.playing = False
        r = self.widget("/api/widgets/spotify/now-playing", history=0)
        self.assertEqual((r.data["playing"], r.data["recent"]), (None, []))

    def test_revoked_access_unlinks(self):
        self.link()
        UserApiInfo.objects.filter(user=self.user).update(spotify_refresh_token="revoked", spotify_token_expires=None)
        r = self.widget("/api/widgets/spotify/now-playing")
        self.assertEqual(r.data["error"], "Spotify account is not configured.")
        self.assertFalse(UserApiInfo.objects.get(user=self.user).spotify_refresh_token)

    def test_top_and_playlists_params(self):
        self.link()
        r = self.widget("/api/widgets/spotify/top", type="artists", period="long_term", count=3)
        self.assertEqual([a["name"] for a in r.data], ["Artiste 0", "Artiste 1", "Artiste 2"])
        self.assertEqual(r.data[0]["subtitle"], "rap, pop")
        self.assertEqual(self.gets[-1][1]["time_range"], "long_term")
        self.assertEqual(len(self.widget("/api/widgets/spotify/top", count=6).data), 6)
        self.assertEqual(self.widget("/api/widgets/spotify/top", period="forever").status_code, 400)
        r = self.widget("/api/widgets/spotify/playlists")
        self.assertEqual([(p["name"], p["tracks"]) for p in r.data], [("À moi", 12), ("Suivie", 40)])
        r = self.widget("/api/widgets/spotify/playlists", owner="mine")
        self.assertEqual([p["name"] for p in r.data], ["À moi"])

    def test_unlink(self):
        self.link()
        self.assertEqual(self.client.delete("/api/services/spotify").status_code, 204)
        self.assertFalse(self.client.get("/api/users/me/integrations").data["has_spotify"])


class SteamSignInTests(TestCase):
    """Settings > Services > Sign in through Steam (OpenID 2.0) and the server-wide key."""

    STEAM_ID = "76561198350063134"

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("ivan", "ivan@example.com", "Motdepasse!42")
        self.client = APIClient(SERVER_NAME="localhost")
        self.client.force_login(self.user)
        self.checks = []

    def start(self):
        r = self.client.get("/api/services/steam/connect")
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r["Location"].startswith("https://steamcommunity.com/openid/login?"))
        return parse_qs(urlparse(r["Location"]).query)["openid.return_to"][0]

    def steam_reply(self, return_to, claimed=None, valid=True):
        claimed = claimed or f"https://steamcommunity.com/openid/id/{self.STEAM_ID}"
        params = {
            "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "id_res",
            "openid.op_endpoint": "https://steamcommunity.com/openid/login",
            "openid.claimed_id": claimed, "openid.identity": claimed, "openid.return_to": return_to,
            "openid.response_nonce": "2026-10-10T21:00:00Zabc", "openid.assoc_handle": "1234567890",
            "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
            "openid.sig": "c2lnbmF0dXJl",
        }
        nonce = parse_qs(urlparse(return_to).query)["nonce"][0]

        def post(url, data=None, timeout=None):
            self.checks.append(data)
            body = "ns:http://specs.openid.net/auth/2.0\nis_valid:" + ("true" if valid else "false") + "\n"
            return type("R", (), {"ok": True, "text": body})()

        with mock.patch("api.steam_openid.requests.post", side_effect=post):
            return self.client.get("/api/services/steam/callback", {"nonce": nonce, **params})

    def test_sign_in_saves_the_verified_steam_id(self):
        r = self.steam_reply(self.start())
        self.assertEqual(r["Location"], "http://localhost:4200/dashboard/settings?service_linked=steam")
        self.assertEqual(UserApiInfo.objects.get(user=self.user).steam_id, self.STEAM_ID)
        self.assertEqual(self.checks[0]["openid.mode"], "check_authentication")

    def test_forged_or_replayed_answers_are_refused(self):
        return_to = self.start()
        r = self.steam_reply(return_to, valid=False)
        self.assertIn("service_error=failed", r["Location"])
        # nonce already used
        r = self.steam_reply(return_to)
        self.assertIn("service_error=invalid_state", r["Location"])
        # identity that isn't a Steam one
        r = self.steam_reply(self.start(), claimed="https://evil.example/openid/id/76561198000000000")
        self.assertIn("service_error=failed", r["Location"])
        self.assertFalse(UserApiInfo.objects.filter(user=self.user).exclude(steam_id="").exists())

    def test_server_key_is_used_without_a_personal_key(self):
        UserApiInfo.objects.create(user=self.user, steam_id=self.STEAM_ID)
        calls = []

        def fake(url, params=None, headers=None):
            calls.append(params)
            return {"response": {"games": [{"appid": 1, "name": "Jeu", "playtime_forever": 60}]}}

        with mock.patch("api.integrations._get_json", side_effect=fake):
            r = self.client.get("/api/widgets/steam/monthly-playtime")
            self.assertEqual(r.data["error"], "Steam API key is not configured.")
            with override_settings(STEAM_API_KEY="serverkey"):
                self.assertTrue(self.client.get("/api/users/me/integrations").data["steam_server_key"])
                cache.clear()
                r = self.client.get("/api/widgets/steam/monthly-playtime")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(calls[-1]["key"], "serverkey")


@override_settings(OAUTH_CLIENTS=OAUTH)
class GithubFromServicesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("jade", "jade@example.com", "Motdepasse!42")
        UserApiInfo.objects.create(user=self.user, github_token="ghp_old_manual")
        self.client = APIClient(SERVER_NAME="localhost")
        self.client.force_login(self.user)

    def test_connect_from_services_replaces_the_token_and_comes_back_there(self):
        r = self.client.get("/api/auth/github/login?mode=link&from=services")
        state = parse_qs(urlparse(r["Location"]).query)["state"][0]
        post, get = fake_github()
        with mock.patch("api.oauth.requests.post", side_effect=post), \
             mock.patch("api.oauth.requests.get", side_effect=get):
            r = self.client.get("/api/auth/github/callback", {"code": "good-code", "state": state})
        self.assertEqual(r["Location"], "http://localhost:4200/dashboard/settings?service_linked=github")
        self.assertEqual(UserApiInfo.objects.get(user=self.user).github_token, "gho_token")
        self.assertTrue(self.client.get("/api/users/me/integrations").data["github_oauth_available"])


class AdminTests(TestCase):
    def test_admin_pages_open_and_hide_secrets(self):
        admin_user = User.objects.create_superuser("root", "root@example.com", "Motdepasse!42")
        user = User.objects.create_user("lena", "lena@example.com", "Motdepasse!42", is_active=False)
        UserProfile.objects.create(user=user)
        info = UserApiInfo.objects.create(user=user, steam_id="76561198000000000", github_token="ghp_SECRET_TOKEN")
        SocialAccount.objects.create(user=user, provider="github", uid="1", login="lena-gh")
        client = APIClient(SERVER_NAME="localhost")
        client.force_login(admin_user)
        for url in ("/admin/", "/admin/auth/user/", f"/admin/auth/user/{user.pk}/change/",
                    "/admin/api/userapiinfo/", f"/admin/api/userapiinfo/{info.pk}/change/",
                    "/admin/api/userwidgetsettings/", "/admin/api/socialaccount/",
                    "/admin/api/steamplaytimesnapshot/"):
            r = client.get(url)
            self.assertEqual(r.status_code, 200, url)
            self.assertNotIn("ghp_SECRET_TOKEN", r.content.decode(), url)
        self.assertIn("waiting for confirmation", client.get("/admin/auth/user/").content.decode())
        client.post("/admin/auth/user/", {"action": "activate", "_selected_action": [user.pk]})
        user.refresh_from_db()
        self.assertTrue(user.is_active)
