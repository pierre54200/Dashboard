"""Administration section (http://localhost:8080/admin/).

Secrets (API keys, tokens) are never shown: only whether they are set. An administrator
can still clear them (action "Disconnect the services").
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import SocialAccount, SteamPlaytimeSnapshot, UserApiInfo, UserProfile, UserWidgetSettings

admin.site.site_header = "Dashboard : administration"
admin.site.site_title = "Dashboard admin"
admin.site.index_title = "Users, services and widgets"


# --------------------------------------------------------------------------------------------
# Users: profile and linked accounts directly on the user page
# --------------------------------------------------------------------------------------------
class ProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    extra = 0
    fields = ("language", "theme", "text_scale", "glass", "background_dim", "sexe", "age", "pfp", "background")


class SocialAccountInline(admin.TabularInline):
    model = SocialAccount
    extra = 0
    fields = ("provider", "login", "email", "created_at")
    readonly_fields = ("provider", "login", "email", "created_at")
    can_delete = True  # unlinking from the admin is allowed
    verbose_name = "Linked Google / GitHub account"


class UserAdmin(BaseUserAdmin):
    inlines = [ProfileInline, SocialAccountInline]
    list_display = ("username", "email", "is_active", "email_status", "login_methods", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff", "social_accounts__provider")
    actions = ["activate"]

    @admin.display(description="Email")
    def email_status(self, user):
        # Accounts are inactive until the confirmation link is opened
        return "confirmed" if user.is_active else "waiting for confirmation"

    @admin.display(description="Login with")
    def login_methods(self, user):
        methods = ["password"] if user.has_usable_password() else []
        methods += [a.get_provider_display() for a in user.social_accounts.all()]
        return ", ".join(methods) or "nothing"

    @admin.action(description="Activate (confirm the email by hand)")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} account(s) activated.")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("social_accounts")


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


# --------------------------------------------------------------------------------------------
# Services subscribed by each user
# --------------------------------------------------------------------------------------------
@admin.register(UserApiInfo)
class UserApiInfoAdmin(admin.ModelAdmin):
    list_display = ("user", "weather_city", "steam", "github", "spotify", "updated_at")
    search_fields = ("user__username", "user__email", "steam_id", "spotify_display_name")
    readonly_fields = ("user", "steam_key", "github", "spotify", "spotify_display_name", "updated_at")
    fields = ("user", "weather_city", "steam_id", "steam_key", "github", "spotify", "spotify_display_name",
              "updated_at")
    actions = ["disconnect_services"]

    @admin.display(boolean=True, description="Steam")
    def steam(self, info):
        return bool(info.steam_id)

    @admin.display(boolean=True, description="Personal Steam key")
    def steam_key(self, info):
        return bool(info.steam_friends_api_key or info.steam_updates_api_key)

    @admin.display(boolean=True, description="GitHub")
    def github(self, info):
        return bool(info.github_token)

    @admin.display(boolean=True, description="Spotify")
    def spotify(self, info):
        return bool(info.spotify_refresh_token)

    @admin.action(description="Disconnect the services (erase Steam, GitHub and Spotify secrets)")
    def disconnect_services(self, request, queryset):
        updated = queryset.update(
            steam_id="", steam_friends_api_key="", steam_updates_api_key="", github_token="",
            spotify_access_token="", spotify_refresh_token="", spotify_token_expires=None,
            spotify_user_id="", spotify_display_name="", spotify_avatar="",
        )
        self.message_user(request, f"Services disconnected for {updated} user(s).")

    def has_add_permission(self, request):
        return False  # created automatically with the user


# --------------------------------------------------------------------------------------------
# Dashboards
# --------------------------------------------------------------------------------------------
@admin.register(UserWidgetSettings)
class UserWidgetSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "widget_count", "widget_types", "updated_at")
    search_fields = ("user__username",)
    readonly_fields = ("user", "updated_at")

    def _layout(self, obj):
        layout = (obj.settings or {}).get("layout")
        return layout if isinstance(layout, list) else []

    @admin.display(description="Widgets")
    def widget_count(self, obj):
        return len(self._layout(obj))

    @admin.display(description="Types")
    def widget_types(self, obj):
        return ", ".join(sorted({str(w.get("type")) for w in self._layout(obj) if isinstance(w, dict)}))


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "provider", "login", "email", "created_at")
    list_filter = ("provider",)
    search_fields = ("user__username", "login", "email")
    readonly_fields = ("user", "provider", "uid", "login", "email", "created_at")


@admin.register(SteamPlaytimeSnapshot)
class SteamPlaytimeSnapshotAdmin(admin.ModelAdmin):
    list_display = ("user", "name", "app_id", "playtime_forever", "date")
    list_filter = ("date",)
    search_fields = ("user__username", "name")
    date_hierarchy = "date"
