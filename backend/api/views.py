from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_not_required
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

'''
GETTERS
'''
@api_view(['GET'])
@login_not_required
def get_user(request):
    return Response(status = status.HTTP_200_OK)

@api_view(['GET'])
@login_not_required
def get_user_from_id(request, userId):
    try:
        user = User.objects.get(pk=userId)
    except User.DoesNotExist:
        return Response(
            {"error": "User not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    return Response({
        "id": user.pk,
        "username": user.username
    }, status=status.HTTP_200_OK)


@api_view(['GET', 'DELETE'])
def users_me(request):
    if request.method == 'GET':
        user = request.user
        if user.id is not None:
            return Response({
                "id": user.id,
                "username": user.username
            }, status = status.HTTP_200_OK)
        return Response(status = status.HTTP_404_NOT_FOUND)
    elif request.method == 'DELETE':
        request.user.delete()
        logout(request)
        return Response(status = status.HTTP_200_OK)


'''
AUTH
'''
@api_view(['POST'])
@login_not_required
def register_user(request):
    form = UserCreationForm(data = request.data)
    if form.is_valid():
        login(request, form.save())
    else:
        return Response(form.errors, status = status.HTTP_400_BAD_REQUEST)
    return Response(form.data, status = status.HTTP_201_CREATED)

@api_view(['POST'])
def login_user(request):
    form = AuthenticationForm(request, data = request.data)
    if form.is_valid():
        login(request, form.get_user())
        return Response(form.data, status = status.HTTP_202_ACCEPTED)
    return Response(form.errors, status = status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def logout_user(request):
    logout(request)
    return Response(status = status.HTTP_200_OK)
