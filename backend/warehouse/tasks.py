"""
Celery tasks — async and scheduled background work.
All notification sending (email OTP, WhatsApp, FCM) runs here
so mutations never block on slow external APIs.
"""
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


# ─── OTP / auth tasks ─────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def send_email_otp_task(self, to: str, code: str, expiry_minutes: int):
    try:
        from warehouse.services.notifications import send_email
        send_email(
            to=to,
            subject="Your GarmentFlow OTP",
            body_text=f"Your OTP is: {code}\nValid for {expiry_minutes} minutes.",
            body_html=f"<p>Your OTP is: <strong style='font-size:24px'>{code}</strong></p>"
                      f"<p style='color:#888'>Valid for {expiry_minutes} minutes.</p>",
        )
        logger.info("Email OTP sent to %s", to)
    except Exception as exc:
        logger.warning("Email OTP failed (%s), retrying…", exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_whatsapp_otp_task(self, phone: str, code: str, expiry_minutes: int):
    try:
        from warehouse.services.notifications import send_whatsapp_text
        send_whatsapp_text(
            to=phone,
            body=f"Your GarmentFlow OTP is: *{code}*\nValid for {expiry_minutes} minutes.",
        )
        logger.info("WhatsApp OTP sent to %s", phone)
    except Exception as exc:
        logger.warning("WhatsApp OTP failed (%s), retrying…", exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def send_push_task(self, user_id: int, title: str, body: str, data: dict | None = None):
    try:
        from warehouse.services.notifications import send_push_to_user
        send_push_to_user(user_id=user_id, title=title, body=body, data=data or {})
    except Exception as exc:
        logger.warning("FCM push failed for user %s: %s", user_id, exc)
        raise self.retry(exc=exc)


# ─── Scheduled tasks ──────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def check_reorder_points(self):
    """
    Runs daily — checks all active ReorderPoints against current stock.
    Creates in-app notifications for managers when stock falls below threshold.
    """
    try:
      _run_reorder_check()
    except Exception as exc:
        logger.warning("check_reorder_points failed: %s, retrying…", exc)
        raise self.retry(exc=exc)


def _run_reorder_check():
    from django.db.models import Sum
    from warehouse.models import ReorderPoint, RawClothBatch, FinishedProduct
    from warehouse.services.notify import notify_managers

    alerts = []
    for rp in ReorderPoint.objects.filter(active=True).select_related(
        "cloth_category", "cloth_color", "item_type", "warehouse"
    ):
        if rp.item_kind == ReorderPoint.ItemKind.RAW_CLOTH:
            qs = RawClothBatch.objects.filter(
                warehouse=rp.warehouse,
                cloth_category=rp.cloth_category,
                active=True,
            )
            if rp.cloth_color:
                qs = qs.filter(cloth_color=rp.cloth_color)
            total = float(qs.aggregate(t=Sum("available_meters"))["t"] or 0)
            if total <= float(rp.threshold_meters):
                color_label = f" ({rp.cloth_color.name})" if rp.cloth_color else ""
                alerts.append(
                    f"• {rp.cloth_category.name}{color_label}: {total:.1f}m left "
                    f"(threshold {rp.threshold_meters}m) at {rp.warehouse.name}"
                )
        else:
            qs = FinishedProduct.objects.filter(
                warehouse=rp.warehouse,
                item_type=rp.item_type,
                active=True,
            )
            if rp.size:
                qs = qs.filter(size=rp.size)
            total = int(qs.aggregate(t=Sum("quantity"))["t"] or 0)
            if total <= rp.threshold_pieces:
                size_label = f" {rp.size}" if rp.size else ""
                alerts.append(
                    f"• {rp.item_type.name}{size_label}: {total} pcs left "
                    f"(threshold {rp.threshold_pieces}) at {rp.warehouse.name}"
                )

    if not alerts:
        logger.info("Reorder check: all stock levels OK")
        return

    notify_managers(
        title=f"⚠ {len(alerts)} Reorder Alert{'s' if len(alerts) > 1 else ''}",
        message="Stock below reorder point:\n" + "\n".join(alerts),
        level="WARNING",
        link="raw_cloth",
    )
    logger.info("Reorder check: %d alerts sent", len(alerts))


@shared_task
def cleanup_expired_otps():
    """Weekly — removes OTPCode rows older than 24 h to keep the table small."""
    from django.utils import timezone
    from datetime import timedelta
    from warehouse.models import OTPCode
    cutoff = timezone.now() - timedelta(hours=24)
    deleted, _ = OTPCode.objects.filter(created_at__lt=cutoff).delete()
    logger.info("OTP cleanup: %d rows deleted", deleted)


# ─── WhatsApp order notifications ─────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def send_whatsapp_order_notification(self, phone: str, message: str):
    """Send a WhatsApp message for order events (dispatched, placed, etc.)."""
    try:
        from warehouse.services.notifications import send_whatsapp_text
        send_whatsapp_text(to=phone, body=message)
        logger.info("WhatsApp order notification sent to %s", phone)
    except Exception as exc:
        logger.warning("WhatsApp order notification failed (%s), retrying…", exc)
        raise self.retry(exc=exc)


# ─── Payment reminder task ─────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_payment_reminders(self):
    """
    Runs daily. Sends WhatsApp reminders to buyers with outstanding credit:
      • 3 days before due date
      • On the due date
      • 7 days after due date (overdue)
    Uses due_date on CreditTransaction. Falls back to created_at + buyer.credit_days.
    """
    try:
        _run_payment_reminders()
    except Exception as exc:
        logger.warning("send_payment_reminders failed: %s, retrying…", exc)
        raise self.retry(exc=exc)


def _run_payment_reminders():
    from datetime import date, timedelta
    from warehouse.models import CreditTransaction, SystemSettings

    sys = SystemSettings.load()
    if not sys.wa_enabled:
        logger.info("Payment reminders: WhatsApp disabled, skipping.")
        return

    today = date.today()
    trigger_days = {-3, 0, 7}  # days relative to due_date (negative = before)
    sent = 0

    pending = CreditTransaction.objects.filter(
        amount_due__gt=0,
    ).exclude(status=CreditTransaction.Status.SETTLED).select_related("buyer", "sales_order")

    for ct in pending:
        due = ct.due_date
        if not due:
            # Fallback: created_at + buyer credit_days
            days = ct.buyer.credit_days or 30
            due = ct.created_at.date() + timedelta(days=days)

        days_diff = (today - due).days  # positive = overdue, negative = upcoming
        if days_diff not in trigger_days:
            continue

        phone = ct.buyer.whatsapp or ct.buyer.phone
        if not phone:
            continue

        currency = sys.currency_symbol
        if days_diff == -3:
            msg = (
                f"Dear {ct.buyer.name},\n"
                f"This is a reminder that your payment of *{currency}{ct.amount_due:.2f}* "
                f"for order *{ct.sales_order.order_number}* is due in *3 days* ({due.strftime('%d %b %Y')}).\n"
                f"Please arrange payment at your earliest convenience.\n— {sys.company_name}"
            )
        elif days_diff == 0:
            msg = (
                f"Dear {ct.buyer.name},\n"
                f"Your payment of *{currency}{ct.amount_due:.2f}* "
                f"for order *{ct.sales_order.order_number}* is *due today*.\n"
                f"Please make the payment to avoid any inconvenience.\n— {sys.company_name}"
            )
        else:
            msg = (
                f"Dear {ct.buyer.name},\n"
                f"⚠ Your payment of *{currency}{ct.amount_due:.2f}* "
                f"for order *{ct.sales_order.order_number}* is *overdue by {days_diff} days*.\n"
                f"Please clear the dues immediately. Contact us if you have any concerns.\n— {sys.company_name}"
            )

        send_whatsapp_order_notification.delay(phone, msg)
        sent += 1

    logger.info("Payment reminders: %d messages queued.", sent)
