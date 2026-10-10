import re
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

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
