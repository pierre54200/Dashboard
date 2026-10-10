from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_not_required
from django.contrib.auth.models import User
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

from .models import UserApiInfo, UserProfile, UserWidgetSettings
from .serializer import (
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
    description="Creates the user and logs them in (session cookie).",
    request=RegisterSerializer,
    responses={201: UserSerializer, 400: RegisterSerializer},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register_user(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        user = serializer.save()
    except IntegrityError:
        return Response(
            {"username": ["Username already taken."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    login(request, user)
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@login_not_required
@extend_schema(
    tags=AUTH,
    summary="Log in",
    description="Starts a session (session cookie).",
    request=LoginSerializer,
    responses={202: UserSerializer, 400: LoginSerializer},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login_user(request):
    serializer = LoginSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)

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
