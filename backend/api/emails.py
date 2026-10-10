"""Account confirmation by email."""
import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import EmailMultiAlternatives
from django.utils.encoding import force_bytes, force_str
from django.utils.html import escape
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

logger = logging.getLogger(__name__)


class EmailConfirmationTokenGenerator(PasswordResetTokenGenerator):
    """Signed, expiring token (PASSWORD_RESET_TIMEOUT, 3 days by default).
    is_active is part of the hash: the link stops working once the account is confirmed."""

    key_salt = "api.emails.EmailConfirmationTokenGenerator"

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.is_active}{user.email}{timestamp}"


confirmation_token = EmailConfirmationTokenGenerator()


def confirmation_link(user):
    query = urlencode({
        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "token": confirmation_token.make_token(user),
    })
    return f"{settings.FRONTEND_URL}/confirm-email?{query}"


def user_from_uid(User, uid):
    try:
        return User.objects.get(pk=int(force_str(urlsafe_base64_decode(uid))))
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None


TEXTS = {
    "fr": {
        "subject": "Confirme ton adresse e-mail - Dashboard",
        "hello": "Bonjour {name},",
        "body": "Merci pour ton inscription ! Clique sur le lien ci-dessous pour confirmer ton adresse e-mail et accéder à ton dashboard.",
        "button": "Confirmer mon adresse",
        "expiry": "Ce lien est valable 3 jours. Si tu n'as pas créé de compte, ignore simplement ce message.",
    },
    "en": {
        "subject": "Confirm your email address - Dashboard",
        "hello": "Hi {name},",
        "body": "Thanks for signing up! Click the link below to confirm your email address and access your dashboard.",
        "button": "Confirm my address",
        "expiry": "This link is valid for 3 days. If you didn't create an account, just ignore this message.",
    },
}


def send_confirmation_email(user, language="fr"):
    """Returns True if the email was handed to the mail server."""
    t = TEXTS.get(language, TEXTS["fr"])
    link = confirmation_link(user)
    hello = t["hello"].format(name=user.username)

    text = f"{hello}\n\n{t['body']}\n\n{link}\n\n{t['expiry']}\n"
    html = f"""<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#313338">
<p>{escape(hello)}</p>
<p>{escape(t['body'])}</p>
<p style="margin:28px 0"><a href="{escape(link)}" style="background:#5865f2;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:bold">{escape(t['button'])}</a></p>
<p style="font-size:13px;color:#4e5058">{escape(t['expiry'])}</p>
</div>"""

    message = EmailMultiAlternatives(t["subject"], text, settings.DEFAULT_FROM_EMAIL, [user.email])
    message.attach_alternative(html, "text/html")
    try:
        message.send()
        return True
    except Exception:  # SMTP down, bad credentials... The user can ask for a new link.
        logger.exception("Could not send the confirmation email to user %s", user.pk)
        return False
