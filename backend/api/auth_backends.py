from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailOrUsernameBackend(ModelBackend):
    """Log in with either the username or the email address (case-insensitive)."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password or "@" not in username:
            return super().authenticate(request, username=username, password=password, **kwargs)

        User = get_user_model()
        user = User.objects.filter(email__iexact=username).order_by("id").first()
        if user is None:
            # Same cost as a real check, so response time doesn't reveal which emails exist.
            User().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None


def find_user_by_login(identifier):
    """User matching a username or an email, whatever its is_active state."""
    User = get_user_model()
    if "@" in identifier:
        return User.objects.filter(email__iexact=identifier).order_by("id").first()
    return User.objects.filter(username=identifier).first()
