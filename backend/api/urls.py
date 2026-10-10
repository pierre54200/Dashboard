from django.urls import path

from .views import (
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

    path('widgets/avatars', widget_avatars, name='widget_avatars'),
    path('widgets/weather', widget_weather, name='widget_weather'),
    path('widgets/steam/friends', widget_steam_friends, name='widget_steam_friends'),
    path('widgets/steam/updates', widget_steam_updates, name='widget_steam_updates'),
    path('widgets/github/notifications', widget_github_notifications, name='widget_github_notifications'),
    path('widgets/github/commits', widget_github_commits, name='widget_github_commits'),
    path('widgets/steam/monthly-playtime', widget_steam_monthly_playtime, name='widget_steam_monthly_playtime'),
]
