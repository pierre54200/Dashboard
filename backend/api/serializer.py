from django.contrib.auth import authenticate
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import UserApiInfo

MAX_IMAGE_BYTES = 5 * 1024 * 1024


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    user: AbstractBaseUser

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid username or password.")
        self.user = user
        return attrs


class ErrorSerializer(serializers.Serializer):
    error = serializers.CharField()


class ApiInfoSerializer(serializers.ModelSerializer):

    has_steam_friends_api_key = serializers.SerializerMethodField()
    has_steam_updates_api_key = serializers.SerializerMethodField()
    has_github_token = serializers.SerializerMethodField()

    class Meta:
        model = UserApiInfo
        fields = [
            "weather_city",
            "steam_id",
            "steam_friends_api_key",
            "steam_updates_api_key",
            "github_token",
            "has_steam_friends_api_key",
            "has_steam_updates_api_key",
            "has_github_token",
        ]
        extra_kwargs = {
            "steam_friends_api_key": {"write_only": True},
            "steam_updates_api_key": {"write_only": True},
            "github_token": {"write_only": True},
        }

    @extend_schema_field(bool)
    def get_has_steam_friends_api_key(self, obj):
        return bool(obj.steam_friends_api_key)

    @extend_schema_field(bool)
    def get_has_steam_updates_api_key(self, obj):
        return bool(obj.steam_updates_api_key)

    @extend_schema_field(bool)
    def get_has_github_token(self, obj):
        return bool(obj.github_token)

    def validate_steam_id(self, value):
        if value and not (value.isdigit() and len(value) == 17):
            raise serializers.ValidationError("Must be a 17-digit SteamID64.")
        return value

class WeatherCurrentSerializer(serializers.Serializer):
    time = serializers.CharField()
    interval = serializers.IntegerField()
    temperature_2m = serializers.FloatField()
    apparent_temperature = serializers.FloatField()
    relative_humidity_2m = serializers.IntegerField()
    weather_code = serializers.IntegerField(help_text="WMO weather code (0 = clear sky, 61 = rain, ...)")
    wind_speed_10m = serializers.FloatField()
    is_day = serializers.IntegerField(help_text="1 = day, 0 = night")


class WeatherTodaySerializer(serializers.Serializer):
    date = serializers.CharField()
    weather_code = serializers.IntegerField()
    temp_max = serializers.FloatField()
    temp_min = serializers.FloatField()


class WeatherResponseSerializer(serializers.Serializer):
    city = serializers.CharField()
    country = serializers.CharField()
    current = WeatherCurrentSerializer()
    units = serializers.DictField(child=serializers.CharField(), help_text="Unit of each `current` field")
    today = WeatherTodaySerializer(allow_null=True, help_text="Today's high/low")


class SteamFriendSerializer(serializers.Serializer):
    steam_id = serializers.CharField()
    name = serializers.CharField()
    avatar = serializers.URLField()
    profile_url = serializers.URLField()
    status = serializers.IntegerField(help_text="0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 looking to trade, 6 looking to play")
    game = serializers.CharField(allow_null=True, help_text="Name of the game being played, null if none")
    game_id = serializers.CharField(allow_null=True)
    last_logoff = serializers.IntegerField(allow_null=True, help_text="Unix timestamp")


class SteamUpdateSerializer(serializers.Serializer):
    app_id = serializers.IntegerField()
    game = serializers.CharField()
    header_image = serializers.URLField()
    title = serializers.CharField()
    summary = serializers.CharField()
    url = serializers.URLField()
    date = serializers.IntegerField(help_text="Unix timestamp")


class GithubNotificationSerializer(serializers.Serializer):
    id = serializers.CharField()
    unread = serializers.BooleanField()
    reason = serializers.CharField(help_text="mention, review_requested, assign, subscribed, ...")
    title = serializers.CharField()
    type = serializers.CharField(help_text="Issue, PullRequest, Release, Commit, ...")
    repo = serializers.CharField()
    url = serializers.URLField()
    updated_at = serializers.CharField()

class GithubCommitSerializer(serializers.Serializer):
    sha = serializers.CharField(help_text="Short (7 char) commit hash")
    message = serializers.CharField(help_text="First line of the commit message")
    author = serializers.CharField()
    author_login = serializers.CharField(allow_null=True)
    avatar = serializers.URLField(allow_null=True)
    url = serializers.URLField()
    date = serializers.CharField()


class AvatarsSerializer(serializers.Serializer):
    steam = serializers.URLField(allow_null=True, help_text="Steam avatar, null if Steam is not configured")
    steam_name = serializers.CharField(allow_null=True)
    github = serializers.URLField(allow_null=True, help_text="GitHub avatar, null without a GitHub token")
    github_login = serializers.CharField(allow_null=True)


class SteamMonthlyGameSerializer(serializers.Serializer):
    app_id = serializers.IntegerField()
    name = serializers.CharField()
    header_image = serializers.URLField()
    minutes_this_month = serializers.IntegerField()
    hours_this_month = serializers.FloatField()


class SteamMonthlyPlaytimeSerializer(serializers.Serializer):
    month = serializers.CharField(help_text="YYYY-MM")
    tracked_since = serializers.CharField(help_text="First day snapshots exist; figures may be partial before the month start")
    games = SteamMonthlyGameSerializer(many=True)

def _validate_image_size(file):
    if file.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("Image must be 5 MB or less.")


class ProfileInfoSerializer(serializers.Serializer):
    username = serializers.CharField(
        min_length=3, max_length=150, required=False,
        validators=User._meta.get_field("username").validators,
    )
    email = serializers.EmailField(required=False)
    sexe = serializers.CharField(max_length=20, required=False, allow_blank=True)
    age = serializers.IntegerField(min_value=1, max_value=120, required=False, allow_null=True)

    def validate_username(self, value):
        user = self.context["request"].user
        if User.objects.filter(username__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def validate_email(self, value):
        user = self.context["request"].user
        if User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("Email already in use.")
        return value


class ProfilePersoSerializer(serializers.Serializer):
    background = serializers.ImageField(required=False, allow_null=True, validators=[_validate_image_size])
    pfp = serializers.ImageField(required=False, allow_null=True, validators=[_validate_image_size])
    theme = serializers.IntegerField(min_value=0, max_value=99, required=False,
                                     help_text="0 dark, 1 light, 2 system")
    glass = serializers.BooleanField(required=False)
    background_dim = serializers.IntegerField(min_value=0, max_value=80, required=False)
    text_scale = serializers.ChoiceField(choices=[85, 100, 115, 130], required=False)


class ProfileSerializer(serializers.Serializer):

    id = serializers.IntegerField(read_only=True)
    info = ProfileInfoSerializer(required=False)
    perso = ProfilePersoSerializer(required=False)