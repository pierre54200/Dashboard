from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db.models.signals import pre_delete
from django.dispatch import receiver


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request):
    return Response(status=204)

@receiver(pre_delete, sender=get_user_model())
def protect_superusers(sender, instance, **kwargs):
    if instance.is_superuser:
        raise PermissionDenied("Un superuser ne peut pas être supprimé.")