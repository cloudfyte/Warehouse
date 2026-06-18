from graphql import GraphQLError

from warehouse.models import ReturnRecord, StockMovement, Vendor
from warehouse.permissions import get_product, get_warehouse
from .stock import apply_stock_change


def create_return(
    *,
    user,
    product_id,
    warehouse_id,
    return_type,
    condition,
    quantity,
    reason,
    vendor_id=None,
    reference="",
):
    return_type, condition = return_type.upper(), condition.upper()
    if return_type not in ReturnRecord.ReturnType.values:
        raise GraphQLError("Return type must be CUSTOMER or VENDOR.")
    if condition not in ReturnRecord.Condition.values:
        raise GraphQLError("Condition must be RESTOCKABLE or DAMAGED.")
    if quantity <= 0:
        raise GraphQLError("Quantity must be greater than zero.")

    product = get_product(product_id)
    warehouse = get_warehouse(user, warehouse_id)
    vendor = Vendor.objects.filter(pk=vendor_id).first() if vendor_id else product.vendor

    record = ReturnRecord.objects.create(
        product=product,
        warehouse=warehouse,
        vendor=vendor,
        return_type=return_type,
        condition=condition,
        quantity=quantity,
        reference=reference,
        reason=reason,
        created_by=user,
    )

    movement_type, delta = None, 0
    if return_type == ReturnRecord.ReturnType.CUSTOMER and condition == ReturnRecord.Condition.RESTOCKABLE:
        movement_type, delta = StockMovement.MovementType.CUSTOMER_RETURN, quantity
    elif return_type == ReturnRecord.ReturnType.VENDOR:
        movement_type, delta = StockMovement.MovementType.VENDOR_RETURN, -quantity

    if movement_type:
        apply_stock_change(
            product=product,
            warehouse=warehouse,
            delta=delta,
            movement_type=movement_type,
            user=user,
            reference=reference,
            notes=reason,
        )
    return record
