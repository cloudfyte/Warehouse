from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import DamagedProduct, StockMovement
from warehouse.permissions import get_product, get_warehouse
from .stock import apply_stock_change


def report_damage(*, user, product_id, warehouse_id, quantity, reason, reference=""):
    if quantity <= 0:
        raise GraphQLError("Quantity must be greater than zero.")
    product = get_product(product_id)
    warehouse = get_warehouse(user, warehouse_id)
    damage = DamagedProduct.objects.create(
        product=product,
        warehouse=warehouse,
        vendor=product.vendor,
        quantity=quantity,
        reason=reason,
        reference=reference,
        created_by=user,
    )
    apply_stock_change(
        product=product,
        warehouse=warehouse,
        delta=-quantity,
        movement_type=StockMovement.MovementType.DAMAGE,
        user=user,
        reference=reference,
        notes=reason,
    )
    return damage


def resolve_damage(*, id, status, notes=""):
    status = status.upper()
    if status not in DamagedProduct.Status.values:
        raise GraphQLError("Invalid status.")
    try:
        damage = DamagedProduct.objects.get(pk=id)
    except DamagedProduct.DoesNotExist as exc:
        raise GraphQLError("Damage record not found.") from exc
    damage.status = status
    if status == DamagedProduct.Status.RESOLVED:
        damage.resolved_at = timezone.now()
    if notes:
        damage.reason = f"{damage.reason}\nResolution: {notes}"
    damage.save()
    return damage
