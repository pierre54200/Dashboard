from django.contrib.auth.models import User
from django.db import models


class UserApiInfo(models.Model):

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="api_info")

    weather_city = models.CharField(max_length=100, blank=True, default="")

    steam_id = models.CharField(max_length=32, blank=True, default="")  # 64-bit SteamID of the user
    steam_friends_api_key = models.CharField(max_length=64, blank=True, default="")
    steam_updates_api_key = models.CharField(max_length=64, blank=True, default="")

    github_token = models.CharField(max_length=255, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"API info for user {self.user_id}"


class UserWidgetSettings(models.Model):

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="widget_settings")
    settings = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Widget settings for user {self.user_id}"
