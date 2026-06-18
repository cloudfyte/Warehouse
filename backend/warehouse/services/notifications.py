"""External notification services — email and WhatsApp."""
from django.conf import settings
from django.core.mail import send_mail


def send_low_stock_alert(product, warehouse, balance):
    from warehouse.models import SystemSettings
    cfg = SystemSettings.load()
    recipient = cfg.alert_email or getattr(settings, "WAREHOUSE_ALERT_EMAIL", None)
    if recipient:
        send_mail(
            subject=f"⚠️ Low stock alert: {product.name}",
            message=(
                f"Low Stock Alert — {product.name} ({product.sku})\n\n"
                f"Current stock : {balance.quantity} units\n"
                f"Reorder level : {balance.reorder_level} units\n"
                f"Warehouse     : {warehouse.name} ({warehouse.code})\n"
                f"Bin location  : {balance.bin_location or 'Not assigned'}\n\n"
                "Please arrange replenishment at your earliest convenience."
            ),
            from_email=None,
            recipient_list=[recipient],
            fail_silently=True,
        )
    send_whatsapp_low_stock_alert(product, warehouse, balance)


def send_replenishment_request(request):
    if not request.vendor.email:
        return False
    send_mail(
        subject=f"Purchase request #{request.id}: {request.product.name}",
        message=(
            f"Dear {request.vendor.contact_person or request.vendor.name},\n\n"
            f"Please arrange {request.quantity} units of {request.product.name} "
            f"({request.product.sku}) for {request.warehouse.name}.\n\n"
            f"Delivery location : {request.warehouse.address or request.warehouse.city or request.warehouse.name}\n"
            f"Expected date     : {request.expected_date or 'Please confirm'}\n"
            f"Notes             : {request.notes or '—'}\n\n"
            "Please reply to confirm availability and delivery schedule.\n\n"
            "Thank you."
        ),
        from_email=None,
        recipient_list=[request.vendor.email],
        fail_silently=False,
    )
    return True


def _send_whatsapp(to_number: str, message: str) -> bool:
    from warehouse.models import SystemSettings
    cfg = SystemSettings.load()
    if not (
        cfg.whatsapp_enabled
        and cfg.whatsapp_account_sid
        and cfg.whatsapp_auth_token
        and cfg.whatsapp_from_number
        and to_number
    ):
        return False
    try:
        import requests as http
        from requests.auth import HTTPBasicAuth

        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/"
            f"{cfg.whatsapp_account_sid}/Messages.json"
        )
        resp = http.post(
            url,
            data={
                "From": f"whatsapp:{cfg.whatsapp_from_number}",
                "To": f"whatsapp:{to_number}",
                "Body": message,
            },
            auth=HTTPBasicAuth(cfg.whatsapp_account_sid, cfg.whatsapp_auth_token),
            timeout=10,
        )
        return resp.status_code == 201
    except Exception:
        return False


def send_whatsapp_low_stock_alert(product, warehouse, balance):
    from warehouse.models import EmployeeProfile, SystemSettings
    cfg = SystemSettings.load()
    if not cfg.whatsapp_enabled:
        return
    message = (
        f"⚠️ *Low Stock Alert*\n"
        f"Product  : {product.name} ({product.sku})\n"
        f"Warehouse: {warehouse.name}\n"
        f"Stock    : {balance.quantity} / Reorder at {balance.reorder_level}\n\n"
        "Please arrange replenishment."
    )
    for profile in EmployeeProfile.objects.filter(
        role__in=[EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER],
        active=True,
        phone__startswith="+",
    ).select_related("user"):
        _send_whatsapp(profile.phone, message)


def send_whatsapp_replenishment(request) -> bool:
    from warehouse.models import SystemSettings
    cfg = SystemSettings.load()
    if not cfg.whatsapp_enabled:
        return False
    vendor_phone = getattr(request.vendor, "phone", "") or ""
    if not vendor_phone.startswith("+"):
        return False
    message = (
        f"📦 *Purchase Request #{request.id}*\n"
        f"Product  : {request.product.name} ({request.product.sku})\n"
        f"Quantity : {request.quantity} units\n"
        f"Warehouse: {request.warehouse.name}\n"
        f"Expected : {request.expected_date or 'TBD'}\n"
        f"Notes    : {request.notes or '—'}\n\n"
        "Please confirm availability and delivery date."
    )
    return _send_whatsapp(vendor_phone, message)
