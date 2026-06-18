from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import EmployeeProfile, Notification, ReplenishmentRequest
from warehouse.permissions import get_product, get_warehouse
from .notifications import send_replenishment_request, send_whatsapp_replenishment


def request_replenishment(*, user, product_id, warehouse_id, quantity, expected_date=None, notes="", send_now=True):
    if quantity <= 0:
        raise GraphQLError("Quantity must be greater than zero.")
    product = get_product(product_id)
    if not product.vendor:
        raise GraphQLError("Assign a vendor to this product before requesting replenishment.")

    req = ReplenishmentRequest.objects.create(
        product=product,
        vendor=product.vendor,
        warehouse=get_warehouse(user, warehouse_id),
        quantity=quantity,
        expected_date=expected_date,
        notes=notes,
        created_by=user,
    )

    email_sent = False
    whatsapp_sent = False
    if send_now:
        try:
            email_sent = send_replenishment_request(req)
        except Exception:
            email_sent = False
        try:
            whatsapp_sent = send_whatsapp_replenishment(req)
        except Exception:
            whatsapp_sent = False
        if email_sent or whatsapp_sent:
            req.status = ReplenishmentRequest.Status.SENT
            req.sent_at = timezone.now()
            req.save(update_fields=["status", "sent_at"])

    managers = EmployeeProfile.objects.filter(
        role__in=[EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER],
        active=True,
    ).select_related("user")
    Notification.objects.bulk_create([
        Notification(
            recipient=manager.user,
            title=f"Replenishment requested: {product.name}",
            message=(
                f"{quantity} units requested from {product.vendor.name} "
                f"for {req.warehouse.name}."
            ),
            level=Notification.Level.INFO,
        )
        for manager in managers
    ])

    return req, email_sent, whatsapp_sent


def update_replenishment_status(*, id, status):
    status = status.upper()
    if status not in ReplenishmentRequest.Status.values:
        raise GraphQLError("Invalid status.")
    try:
        req = ReplenishmentRequest.objects.get(pk=id)
    except ReplenishmentRequest.DoesNotExist as exc:
        raise GraphQLError("Replenishment request not found.") from exc
    req.status = status
    if status == ReplenishmentRequest.Status.SENT and not req.sent_at:
        req.sent_at = timezone.now()
    req.save()
    return req
