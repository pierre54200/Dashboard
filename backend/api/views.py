from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_not_required
from django.contrib.auth.models import User
from django.db import IntegrityError
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .serializer import (
    ErrorSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)

USERS = ["Users"]
AUTH = ["Auth"]


"""
GETTERS
"""
@extend_schema(
    tags=USERS,
    summary="Ping",
    description="Simple endpoint returning an empty 200. Does not require authentication.",
    responses={200: None},
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@login_not_required
def get_user(request):
    return Response(status=status.HTTP_200_OK)


@extend_schema(
    tags=USERS,
    summary="Get a user by id",
    parameters=[OpenApiParameter("userId", int, OpenApiParameter.PATH, description="User id")],
    responses={200: UserSerializer, 404: ErrorSerializer},
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@login_not_required
def get_user_from_id(request, userId):
    try:
        user = User.objects.get(pk=userId)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


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

    user.delete()
    logout(request)
    return Response(status=status.HTTP_200_OK)


"""
AUTH
"""
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
@login_not_required
def register_user(request):
    serializer = RegisterSerializer(data=request.data)
    # assert isinstance(serializer, LoginSerializer)
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
@login_not_required
def login_user(request):
    serializer = LoginSerializer(data=request.data, context={"request": request})
    assert isinstance(serializer, LoginSerializer)
    serializer.is_valid(raise_exception=True)

    user = serializer.user
    login(request, serializer.user)
    return Response(UserSerializer(user).data, status=status.HTTP_202_ACCEPTED)


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
