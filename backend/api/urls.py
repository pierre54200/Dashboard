from django.urls import path

from .oauth import oauth_callback, oauth_login
from .views import (
    oauth_providers,
    users_me_connection_delete,
    users_me_connections,
    users_me_password,
    confirm_email,
    resend_confirmation,
    get_user,
    get_user_from_id,
    login_user,
    logout_user,
    register_user,
    users_me,
    users_me_integrations,
    users_me_profile,
    users_me_widgets,
)
from .widget_views import (
    widget_avatars,
    widget_github_commits,
    widget_github_notifications,
    widget_steam_friends,
    widget_steam_monthly_playtime,
    widget_steam_updates,
    widget_weather,
)

urlpatterns = [
    path('users/get', get_user, name='get_user'),
    path('users/get/<int:userId>', get_user_from_id, name='get_user_from_id'),
    path('users/me', users_me, name='users_me'),
    path('users/me/profile', users_me_profile, name='users_me_profile'),
    path('users/me/integrations', users_me_integrations, name='users_me_integrations'),
    path('users/me/widgets', users_me_widgets, name='users_me_widgets'),
    path('users/register', register_user, name='register_user'),
    path('users/login', login_user, name='login_user'),
    path('users/logout', logout_user, name='logout_user'),
    path('users/confirm', confirm_email, name='confirm_email'),
    path('users/me/password', users_me_password, name='users_me_password'),
    path('users/me/connections', users_me_connections, name='users_me_connections'),
    path('users/me/connections/<str:provider>', users_me_connection_delete, name='users_me_connection_delete'),

    path('auth/providers', oauth_providers, name='oauth_providers'),
    path('auth/<str:provider>/login', oauth_login, name='oauth_login'),
    path('auth/<str:provider>/callback', oauth_callback, name='oauth_callback'),
    path('users/confirm/resend', resend_confirmation, name='resend_confirmation'),

    path('widgets/avatars', widget_avatars, name='widget_avatars'),
    path('widgets/weather', widget_weather, name='widget_weather'),
    path('widgets/steam/friends', widget_steam_friends, name='widget_steam_friends'),
    path('widgets/steam/updates', widget_steam_updates, name='widget_steam_updates'),
    path('widgets/github/notifications', widget_github_notifications, name='widget_github_notifications'),
    path('widgets/github/commits', widget_github_commits, name='widget_github_commits'),
    path('widgets/steam/monthly-playtime', widget_steam_monthly_playtime, name='widget_steam_monthly_playtime'),
]
