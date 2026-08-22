"""OTP generation, delivery (email + SMS), and verification."""
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import OTPCode, SystemSettings

User = get_user_model()


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_email_otp(user, code: str, purpose: str, cfg: SystemSettings):
    if not cfg.email_enabled:
        return False
    subject = "Your login OTP" if purpose == OTPCode.Purpose.LOGIN else "Your password reset OTP"
    body = (
        f"Hello {user.username},\n\n"
        f"Your OTP for {purpose.lower().replace('_', ' ')} is: {code}\n\n"
        f"This code is valid for {cfg.otp_expiry_minutes} minutes.\n\n"
        "If you did not request this, please ignore this email."
    )
    from warehouse.services.notifications import send_email as _send
    return _send(to=user.email, subject=subject, body_text=body)


def _send_sms_otp(user, code: str, purpose: str, cfg: SystemSettings):
    if not cfg.sms_enabled or not cfg.twilio_account_sid:
        return False
    try:
        from twilio.rest import Client
        client = Client(cfg.twilio_account_sid, cfg.twilio_auth_token)
        from warehouse.models import EmployeeProfile
        try:
            phone = EmployeeProfile.objects.get(user=user).phone
        except EmployeeProfile.DoesNotExist:
            return False
        if not phone:
            return False
        client.messages.create(
            body=f"Your GarmentFlow OTP: {code} (valid {cfg.otp_expiry_minutes} min)",
            from_=cfg.twilio_from_number,
            to=phone,
        )
        return True
    except Exception:
        return False


def _send_whatsapp_otp(user, code: str, purpose: str, cfg: SystemSettings):
    """Send OTP via WhatsApp using the approved hms_otp template (no 24h window restriction)."""
    if not cfg.wa_enabled:
        return False
    try:
        from warehouse.models import EmployeeProfile
        try:
            phone = EmployeeProfile.objects.get(user=user).phone
        except EmployeeProfile.DoesNotExist:
            return False
        if not phone:
            return False

        from warehouse.services.notifications import send_whatsapp_template
        return send_whatsapp_template(
            to=phone,
            template_name="hms_otp",
            components=[
                {"type": "body", "parameters": [{"type": "text", "text": code}]},
                {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": code}]},
            ],
        )
    except Exception:
        return False


def request_otp(*, username: str, purpose: str, channel: str) -> dict:
    from warehouse.services.auth import resolve_identifier
    user = resolve_identifier(username)

    cfg = SystemSettings.load()
    if not cfg.allow_otp_login:
        raise GraphQLError("OTP login is not enabled on this system.")

    # Rate-limit: max 3 valid unused OTPs per user per hour
    recent = OTPCode.objects.filter(
        user=user, purpose=purpose, used=False,
        created_at__gte=timezone.now() - timedelta(hours=1),
    ).count()
    if recent >= 3:
        raise GraphQLError("Too many OTP requests. Please wait before trying again.")

    code = _generate_code()
    from django.contrib.auth.hashers import make_password
    expiry = timezone.now() + timedelta(minutes=cfg.otp_expiry_minutes)

    otp = OTPCode.objects.create(
        user=user,
        code=make_password(code),
        purpose=purpose,
        channel=channel,
        expires_at=expiry,
    )

    email_sent, sms_sent, wa_sent = False, False, False
    if channel in (OTPCode.Channel.EMAIL, "BOTH"):
        email_sent = _send_email_otp(user, code, purpose, cfg)
    if channel in (OTPCode.Channel.SMS, "BOTH"):
        sms_sent = _send_sms_otp(user, code, purpose, cfg)
    if channel == OTPCode.Channel.WHATSAPP:
        wa_sent = _send_whatsapp_otp(user, code, purpose, cfg)

    return {"otp_id": otp.pk, "email_sent": email_sent, "sms_sent": sms_sent, "wa_sent": wa_sent}


def verify_otp_and_login(*, username: str, code: str, purpose: str):
    """Verify OTP and return the user (caller creates JWT token)."""
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist as exc:
        raise GraphQLError("Invalid credentials.") from exc

    with transaction.atomic():
        otp = (
            OTPCode.objects
            .select_for_update()
            .filter(user=user, purpose=purpose, used=False)
            .order_by("-created_at")
            .first()
        )
        if not otp or not otp.is_valid:
            raise GraphQLError("OTP has expired or is invalid. Please request a new one.")

        otp.attempts += 1
        from django.contrib.auth.hashers import check_password
        if not check_password(code, otp.code):
            otp.save(update_fields=["attempts"])
            raise GraphQLError("Incorrect OTP.")

        otp.used = True
        otp.save(update_fields=["used", "attempts"])
    return user
