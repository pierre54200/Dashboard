from django.contrib.auth.models import User
from django.db import models


class UserApiInfo(models.Model):

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="api_info")

    weather_city = models.CharField(max_length=100, blank=True, default="")

    steam_id = models.CharField(max_length=32, blank=True, default="")  # 64-bit SteamID of the user
    steam_friends_api_key = models.CharField(max_length=64, blank=True, default="")
    steam_updates_api_key = models.CharField(max_length=64, blank=True, default="")

    github_token = models.CharField(max_length=255, blank=True, default="")

    # Spotify, linked with OAuth (Settings > Services). The access token lasts 1 hour and is
    # renewed with the refresh token, see api/spotify.py.
    spotify_access_token = models.CharField(max_length=512, blank=True, default="")
    spotify_refresh_token = models.CharField(max_length=512, blank=True, default="")
    spotify_token_expires = models.DateTimeField(null=True, blank=True)
    spotify_user_id = models.CharField(max_length=128, blank=True, default="")
    spotify_display_name = models.CharField(max_length=255, blank=True, default="")
    spotify_avatar = models.URLField(max_length=500, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"API info for user {self.user_id}"


class UserWidgetSettings(models.Model):

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="widget_settings")
    settings = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Widget settings for user {self.user_id}"

class SteamPlaytimeSnapshot(models.Model):

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="steam_snapshots")
    app_id = models.PositiveIntegerField()
    name = models.CharField(max_length=255, blank=True, default="")
    playtime_forever = models.PositiveIntegerField()  # minutes
    date = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "app_id", "date"], name="uniq_user_app_day"),
        ]
        indexes = [models.Index(fields=["user", "date"])]

class UserProfile(models.Model):

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    sexe = models.CharField(max_length=20, blank=True, default="")
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    background = models.ImageField(upload_to="backgrounds/", null=True, blank=True)
    pfp = models.ImageField(upload_to="pfp/", null=True, blank=True)
    theme = models.PositiveSmallIntegerField(default=0)  # 0 dark, 1 light, 2 system
    glass = models.BooleanField(default=False)
    background_dim = models.PositiveSmallIntegerField(default=40)  # % of dark/light veil over the background
    text_scale = models.PositiveSmallIntegerField(default=100)
    language = models.CharField(max_length=5, default="fr", choices=[("fr", "Français"), ("en", "English")])  # % of the base font size

    def __str__(self):
        return f"Profile of user {self.user_id}"

class SocialAccount(models.Model):
    """Google or GitHub account linked to a user (OAuth 2.0 login)."""

    PROVIDERS = [("google", "Google"), ("github", "GitHub")]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_accounts")
    provider = models.CharField(max_length=20, choices=PROVIDERS)
    uid = models.CharField(max_length=255)  # account id at the provider, never changes
    email = models.EmailField(blank=True, default="")
    login = models.CharField(max_length=255, blank=True, default="")  # name shown in the settings
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "uid"], name="uniq_social_provider_uid"),
            models.UniqueConstraint(fields=["user", "provider"], name="uniq_social_user_provider"),
        ]

    def __str__(self):
        return f"{self.provider} account of user {self.user_id}"
