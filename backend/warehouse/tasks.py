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

@shared_task
def check_reorder_points():
    """
    Runs daily — checks all active ReorderPoints against current stock.
    Creates in-app notifications for managers when stock falls below threshold.
    """
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
