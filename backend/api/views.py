from django.contrib.auth import get_user_model, login, logout, update_session_auth_hash
from django.contrib.auth.decorators import login_not_required
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import IntegrityError, transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import SocialAccount, UserApiInfo, UserProfile, UserWidgetSettings
from .oauth import PROVIDERS, enabled_providers
from .emails import confirmation_token, send_confirmation_email, user_from_uid
from .serializer import (
    ChangePasswordSerializer,
    ConfirmEmailSerializer,
    EmailNotConfirmed,
    ResendConfirmationSerializer,
    ApiInfoSerializer,
    ErrorSerializer,
    LoginSerializer,
    ProfileSerializer,
    RegisterSerializer,
    UserSerializer,
)

USERS = ["Users"]
AUTH = ["Auth"]
SETTINGS = ["Settings"]

"""
GETTERS
"""
@login_not_required
@extend_schema(
    tags=USERS,
    summary="Ping",
    description="Simple endpoint returning an empty 200. Does not require authentication.",
    responses={200: None},
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def get_user(request):
    return Response(status=status.HTTP_200_OK)


@login_not_required
@extend_schema(
    tags=USERS,
    summary="Get a user by id",
    parameters=[OpenApiParameter("userId", int, OpenApiParameter.PATH, description="User id")],
    responses={200: UserSerializer, 404: ErrorSerializer},
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def get_user_from_id(request, userId):
    try:
        user = User.objects.get(pk=userId)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


@login_not_required
@extend_schema(
    methods=["GET"],
    tags=USERS,
    summary="Get the current user",
    responses={200: UserSerializer, 404: None},
)
@extend_schema(
    methods=["DELETE"],
    tags=USERS,
    summary="Delete the current user and log out",
    responses={200: None, 404: None},
)
@api_view(["GET", "DELETE"])
def users_me(request):
    user = request.user
    if not user.is_authenticated:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)

    user.delete()  # cascades to api info + widget settings
    logout(request)
    return Response(status=status.HTTP_200_OK)


"""
API INTEGRATIONS
"""
@login_not_required
@extend_schema(
    methods=["GET"],
    tags=SETTINGS,
    summary="Get the current user's API configuration",
    description="Secrets are never returned, only `has_*` booleans telling whether they are set.",
    responses={200: ApiInfoSerializer},
    examples=[OpenApiExample(
        "Success",
        value={
            "weather_city": "Paris",
            "steam_id": "76561198000000000",
            "has_steam_friends_api_key": True,
            "has_steam_updates_api_key": False,
            "has_github_token": True,
        },
        response_only=True,
    )],
)
@extend_schema(
    methods=["PATCH"],
    tags=SETTINGS,
    summary="Update the current user's API configuration",
    description="Partial update: only send the fields you want to change. Send an empty string to clear one.",
    request=ApiInfoSerializer,
    responses={200: ApiInfoSerializer, 400: ApiInfoSerializer},
    examples=[
        OpenApiExample(
            "Update city and token",
            value={"weather_city": "Paris", "github_token": "ghp_xxxxxxxxxxxxxxxxxxxx"},
            request_only=True,
        ),
        OpenApiExample(
            "Clear the GitHub token",
            value={"github_token": ""},
            request_only=True,
        ),
        OpenApiExample(
            "Success",
            value={
                "weather_city": "Paris",
                "steam_id": "76561198000000000",
                "has_steam_friends_api_key": True,
                "has_steam_updates_api_key": False,
                "has_github_token": True,
            },
            response_only=True,
            status_codes=["200"],
        ),
        OpenApiExample(
            "Validation error",
            value={"steam_id": ["Must be a 17-digit SteamID64."]},
            response_only=True,
            status_codes=["400"],
        ),
    ],
)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def users_me_integrations(request):
    info, _ = UserApiInfo.objects.get_or_create(user=request.user)

    if request.method == "GET":
        return Response(ApiInfoSerializer(info).data)

    serializer = ApiInfoSerializer(info, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


"""
WIDGET SETTINGS (FrontEndSettings)
"""
@login_not_required
@extend_schema(
    methods=["GET"],
    tags=SETTINGS,
    summary="Get the widget settings",
    description="Returns the JSON object previously saved (`{}` if none).",
    responses={200: OpenApiTypes.OBJECT},
    examples=[OpenApiExample(
        "Saved settings",
        value={"theme": "dark", "layout": [{"id": "weather", "x": 0, "y": 0, "w": 2, "h": 2}]},
        response_only=True,
    )],
)
@extend_schema(
    methods=["POST"],
    tags=SETTINGS,
    summary="Replace the widget settings",
    description="The request body (any JSON object) fully replaces the stored settings.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: ErrorSerializer},
    examples=[
        OpenApiExample(
            "Widget settings",
            value={"theme": "dark", "layout": [{"id": "weather", "x": 0, "y": 0, "w": 2, "h": 2}]},
            request_only=True,
        ),
        OpenApiExample(
            "Success (echoes the stored JSON)",
            value={"theme": "dark", "layout": [{"id": "weather", "x": 0, "y": 0, "w": 2, "h": 2}]},
            response_only=True,
            status_codes=["200"],
        ),
        OpenApiExample(
            "Not an object",
            value={"error": "Body must be a JSON object."},
            response_only=True,
            status_codes=["400"],
        ),
    ],
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def users_me_widgets(request):
    if request.method == "GET":
        obj = UserWidgetSettings.objects.filter(user=request.user).first()
        return Response(obj.settings if obj else {})

    data = request.data
    if hasattr(data, "dict"):
        data = data.dict()
    if not isinstance(data, dict):
        return Response({"error": "Body must be a JSON object."}, status=status.HTTP_400_BAD_REQUEST)

    obj, _ = UserWidgetSettings.objects.update_or_create(
        user=request.user, defaults={"settings": data}
    )
    return Response(obj.settings, status=status.HTTP_200_OK)


"""
AUTH
"""
@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Register a new user",
    description="Creates an inactive account and emails a confirmation link. "
                "The user can log in once the address is confirmed (POST /api/users/confirm).",
    request=RegisterSerializer,
    responses={201: OpenApiTypes.OBJECT, 400: RegisterSerializer},
    examples=[OpenApiExample(
        "Created",
        value={"detail": "confirmation_sent", "email": "alice@example.com", "email_sent": True},
        response_only=True, status_codes=["201"],
    )],
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register_user(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    language = serializer.validated_data.get("language", "fr")
    try:
        with transaction.atomic():
            user = serializer.save()
            UserProfile.objects.create(user=user, language=language)
    except IntegrityError:
        return Response(
            {"username": ["Username already taken."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sent = send_confirmation_email(user, language)
    return Response(
        {"detail": "confirmation_sent", "email": user.email, "email_sent": sent},
        status=status.HTTP_201_CREATED,
    )


RESEND_COOLDOWN = 60  # seconds between two confirmation emails for the same address


@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Confirm the email address",
    description="Activates the account from the link received by email, then logs the user in.",
    request=ConfirmEmailSerializer,
    responses={200: UserSerializer, 400: ErrorSerializer},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def confirm_email(request):
    serializer = ConfirmEmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = user_from_uid(get_user_model(), serializer.validated_data["uid"])
    if user is None or not confirmation_token.check_token(user, serializer.validated_data["token"]):
        return Response({"error": "invalid_or_expired"}, status=status.HTTP_400_BAD_REQUEST)

    user.is_active = True
    user.save(update_fields=["is_active"])
    login(request, user, backend="api.auth_backends.EmailOrUsernameBackend")
    return Response(UserSerializer(user).data)


@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Send the confirmation email again",
    description="Always answers 200, whether the address exists or not, so it can't be used to "
                "find out who has an account. One email per address per minute at most.",
    request=ResendConfirmationSerializer,
    responses={200: None},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def resend_confirmation(request):
    serializer = ResendConfirmationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].strip().lower()

    if cache.add(f"confirm_resend:{email}", True, RESEND_COOLDOWN):
        user = get_user_model().objects.filter(email__iexact=email, is_active=False).first()
        if user is not None:
            profile = UserProfile.objects.filter(user=user).first()
            send_confirmation_email(user, profile.language if profile else "fr")
    return Response(status=status.HTTP_200_OK)


@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Log in",
    description="Starts a session (session cookie). `username` accepts the username or the email "
                "address. 403 with code `email_not_confirmed` if the account isn't confirmed yet.",
    request=LoginSerializer,
    responses={202: UserSerializer, 400: LoginSerializer, 403: OpenApiTypes.OBJECT},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login_user(request):
    serializer = LoginSerializer(data=request.data, context={"request": request})
    try:
        serializer.is_valid(raise_exception=True)
    except EmailNotConfirmed as e:
        return Response(
            {"error": "Email address not confirmed.", "code": "email_not_confirmed", "email": e.email},
            status=status.HTTP_403_FORBIDDEN,
        )

    user = serializer.user
    login(request, user)
    return Response(UserSerializer(user).data, status=status.HTTP_202_ACCEPTED)


@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Log out",
    request=None,
    responses={200: None},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def logout_user(request):
    logout(request)
    return Response(status=status.HTTP_200_OK)


"""
PROFILE
"""
def _profile_data(user, profile):
    return {
        "id": user.id,
        "info": {
            "username": user.username,
            "email": user.email,
            "sexe": profile.sexe,
            "age": profile.age,
            "has_password": user.has_usable_password(),
        },
        "perso": {
            "background": profile.background,
            "pfp": profile.pfp,
            "theme": profile.theme,
            "glass": profile.glass,
            "background_dim": profile.background_dim,
            "text_scale": profile.text_scale,
            "language": profile.language,
        },
    }


@login_not_required
@extend_schema(
    methods=["GET"],
    tags=USERS,
    summary="Get the current user's profile",
    responses={200: ProfileSerializer},
    examples=[OpenApiExample(
        "Success",
        value={
            "id": 1,
            "info": {"username": "alice", "email": "alice@example.com", "sexe": "female", "age": 24},
            "perso": {
                "background": "http://localhost:8080/media/backgrounds/bg.jpg",
                "pfp": None,
                "theme": 2,
                "glass": False,
                "background_dim": 40,
                "text_scale": 100,
                "language": "fr",
            },
        },
        response_only=True,
    )],
)
@extend_schema(
    methods=["PATCH"],
    tags=USERS,
    summary="Update the current user's profile",
    description="Partial update, send only what changes. JSON for text fields, or multipart "
                "(`info.username`, `perso.pfp`, `perso.background`, `perso.theme`...) when uploading images.",
    request=ProfileSerializer,
    responses={200: ProfileSerializer, 400: ProfileSerializer},
    examples=[
        OpenApiExample(
            "Change username and theme",
            value={"info": {"username": "alice2"}, "perso": {"theme": 3}},
            request_only=True,
        ),
        OpenApiExample(
            "Remove the profile picture",
            value={"perso": {"pfp": None}},
            request_only=True,
        ),
    ],
)
@api_view(["GET", "PATCH"])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def users_me_profile(request):
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)
    context = {"request": request}

    if request.method == "GET":
        return Response(ProfileSerializer(_profile_data(user, profile), context=context).data)

    serializer = ProfileSerializer(
        _profile_data(user, profile), data=request.data, partial=True, context=context
    )
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    info = data.get("info", {})
    perso = data.get("perso", {})

    try:
        with transaction.atomic():
            for field in ("username", "email"):
                if field in info:
                    setattr(user, field, info[field])
            user.save()

            for field in ("sexe", "age"):
                if field in info:
                    setattr(profile, field, info[field])
            for field in ("theme", "glass", "background_dim", "text_scale", "language"):
                if field in perso:
                    setattr(profile, field, perso[field])
            for field in ("background", "pfp"):
                if field in perso:
                    old = getattr(profile, field)
                    if old:
                        old.delete(save=False)  # remove the replaced/cleared file from disk
                    setattr(profile, field, perso[field])
            profile.save()
    except IntegrityError:
        return Response({"info": {"username": ["Username already taken."]}},
                        status=status.HTTP_400_BAD_REQUEST)

    return Response(ProfileSerializer(_profile_data(user, profile), context=context).data)



# Wrong current passwords allowed per user before a pause (protects against guessing)
PASSWORD_ATTEMPTS = 5
PASSWORD_LOCK_SECONDS = 15 * 60


@login_not_required
@extend_schema(
    tags=SETTINGS,
    summary="Change (or set) the current user's password",
    description="`current_password` is required when the account already has a password. "
                "An account created with Google/GitHub can set a first password without it. "
                "The current session stays open; the user's other sessions are logged out.",
    request=ChangePasswordSerializer,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 429: ErrorSerializer},
    examples=[
        OpenApiExample("Change", value={"current_password": "old-Pass42", "new_password": "new-Pass42!"},
                       request_only=True),
        OpenApiExample("Success", value={"has_password": True}, response_only=True),
        OpenApiExample("Wrong current password",
                       value={"current_password": ["Current password is incorrect."]},
                       response_only=True, status_codes=["400"]),
    ],
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def users_me_password(request):
    user = request.user
    attempts_key = f"password-attempts:{user.pk}"
    if cache.get(attempts_key, 0) >= PASSWORD_ATTEMPTS:
        return Response({"error": "Too many attempts, try again later."},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)

    serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
    if not serializer.is_valid():
        if "current_password" in serializer.errors and request.data.get("current_password"):
            cache.add(attempts_key, 0, PASSWORD_LOCK_SECONDS)
            cache.incr(attempts_key)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(serializer.validated_data["new_password"])
    user.save(update_fields=["password"])
    # The session hash depends on the password: keep this session, other devices are logged out
    update_session_auth_hash(request, user)
    cache.delete(attempts_key)
    return Response({"has_password": True})


"""
OAUTH CONNECTIONS (Google, GitHub)
"""
@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Login providers available on this server",
    description="Providers with a client id and secret in .env. To log in, open "
                "GET /api/auth/<provider>/login in the browser (full-page navigation).",
    responses={200: OpenApiTypes.OBJECT},
    examples=[OpenApiExample("Success", value=[{"id": "github", "name": "GitHub"}], response_only=True)],
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def oauth_providers(request):
    return Response([{"id": p, "name": PROVIDERS[p]["name"]} for p in enabled_providers()])


def _connections_data(user):
    linked = {a.provider: a for a in SocialAccount.objects.filter(user=user)}
    enabled = set(enabled_providers())
    return {
        "has_password": user.has_usable_password(),
        "providers": [
            {
                "id": p,
                "name": conf["name"],
                "enabled": p in enabled,
                "linked": p in linked,
                "account": (linked[p].login or linked[p].email) if p in linked else None,
                "linked_at": linked[p].created_at if p in linked else None,
            }
            for p, conf in PROVIDERS.items()
        ],
    }


@login_not_required
@extend_schema(
    tags=SETTINGS,
    summary="Google / GitHub accounts linked to the current user",
    description="To link a provider, open GET /api/auth/<provider>/login?mode=link in the browser.",
    responses={200: OpenApiTypes.OBJECT},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def users_me_connections(request):
    return Response(_connections_data(request.user))


@login_not_required
@extend_schema(
    tags=SETTINGS,
    summary="Unlink a Google / GitHub account",
    description="Refused (400, code `keep_one`) if it is the only way left to log in "
                "(account created with Google/GitHub, without a password).",
    responses={200: OpenApiTypes.OBJECT, 400: ErrorSerializer, 404: ErrorSerializer},
)
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def users_me_connection_delete(request, provider):
    account = SocialAccount.objects.filter(user=request.user, provider=provider).first()
    if account is None:
        return Response({"error": "Not linked."}, status=status.HTTP_404_NOT_FOUND)
    others = SocialAccount.objects.filter(user=request.user).exclude(pk=account.pk).exists()
    if not request.user.has_usable_password() and not others:
        return Response(
            {"error": "Keep at least one way to log in.", "code": "keep_one"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    account.delete()
    return Response(_connections_data(request.user))
