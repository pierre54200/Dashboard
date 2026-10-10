from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from api.about import about_json

from .views import csrf

urlpatterns = [
    path("about.json", about_json),
    path('admin/', admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    path('api/', include('api.urls')),
    path("csrf", csrf),
    path("api/csrf", csrf),  # the front calls environment.apiUrl + "csrf"
]
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
