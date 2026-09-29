from django.urls import path

from .views import (
    get_user,
    get_user_from_id,
    login_user,
    logout_user,
    register_user,
    users_me,
)

urlpatterns  = [
    path('users/get', get_user, name = 'get_user'),
    path('users/get/<userId>', get_user_from_id, name = 'get_user_from_id'),
    path('users/me', users_me, name = 'users_me'),
    path('users/register', register_user, name = 'register_user'),
    path('users/login', login_user, name = 'login_user'),
    path('users/logout', logout_user, name = 'logout_user'),
]
