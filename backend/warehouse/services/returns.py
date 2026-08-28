"""Services for buyer and supplier returns."""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.permissions import get_scoped, get_warehouse, scoped
from warehouse.models import (
    BuyerReturn, Buyer, FinishedProduct, SalesOrder,
    SupplierReturn, Supplier, RawClothBatch, ReadymadeStock,
)


def create_buyer_return(*, user, buyer_id, finished_product_id, quantity, condition, reason,
                         warehouse_id, sales_order_id=None):
    try:
        buyer = Buyer.objects.get(pk=buyer_id)
    except Buyer.DoesNotExist as exc:
        raise GraphQLError("Buyer not found.") from exc
    product = get_scoped(user, FinishedProduct, finished_product_id)
    warehouse = get_warehouse(user, warehouse_id)
    if quantity <= 0:
        raise GraphQLError("Quantity must be greater than zero.")

    sales_order = None
    if sales_order_id:
        sales_order = scoped(user, SalesOrder).filter(pk=sales_order_id).first()

    with transaction.atomic():
        ret = BuyerReturn.objects.create(
            buyer=buyer,
            finished_product=product,
            quantity=quantity,
            condition=condition.upper(),
            reason=reason,
            warehouse=warehouse,
            sales_order=sales_order,
            created_by=user,
        )
    return ret


def process_buyer_return(*, user, id, status):
    """Advance a buyer return: PENDING→RECEIVED, RECEIVED→RESTOCKED or DISCARDED.
    RESTOCKED puts the quantity back into finished product stock."""
    status = status.upper()
    valid = (BuyerReturn.Status.RECEIVED, BuyerReturn.Status.RESTOCKED, BuyerReturn.Status.DISCARDED)
    if status not in valid:
        raise GraphQLError(f"Invalid status '{status}'. Must be one of: RECEIVED, RESTOCKED, DISCARDED.")
    ret = get_scoped(user, BuyerReturn, id)

    if ret.status == BuyerReturn.Status.PENDING and status != BuyerReturn.Status.RECEIVED:
        raise GraphQLError("A pending return must be marked RECEIVED before restocking or discarding.")
    if ret.status in (BuyerReturn.Status.RESTOCKED, BuyerReturn.Status.DISCARDED):
        raise GraphQLError("This return is already completed.")

    with transaction.atomic():
        if status == BuyerReturn.Status.RESTOCKED:
            fp = FinishedProduct.objects.select_for_update().get(pk=ret.finished_product_id)
            fp.quantity += ret.quantity
            fp.save(update_fields=["quantity", "updated_at"])
        ret.status = status
        ret.save(update_fields=["status", "updated_at"])
    return ret


def create_supplier_return(*, user, supplier_id, return_kind, reason, warehouse_id,
                            raw_cloth_batch_id=None, meters_returned=None,
                            readymade_stock_id=None, quantity_returned=None):
    try:
        supplier = Supplier.objects.get(pk=supplier_id)
    except Supplier.DoesNotExist as exc:
        raise GraphQLError("Supplier not found.") from exc
    warehouse = get_warehouse(user, warehouse_id)

    return_kind = return_kind.upper()
    if return_kind not in ("RAW_CLOTH", "READYMADE"):
        raise GraphQLError("Invalid return kind.")

    raw_batch = None
    readymade = None
    if return_kind == "RAW_CLOTH":
        if not raw_cloth_batch_id or not meters_returned:
            raise GraphQLError("Raw cloth batch and meters returned are required for RAW_CLOTH returns.")
        meters_returned = Decimal(str(meters_returned))
        if meters_returned <= 0:
            raise GraphQLError("Meters returned must be greater than zero.")
    else:
        if not readymade_stock_id or not quantity_returned:
            raise GraphQLError("Readymade stock and quantity are required for READYMADE returns.")
        if quantity_returned <= 0:
            raise GraphQLError("Quantity must be greater than zero.")

    # Goods sent back to a supplier were recorded but never taken out of stock,
    # so the same cloth stayed available to cut and the same units stayed sellable.
    with transaction.atomic():
        if return_kind == "RAW_CLOTH":
            raw_batch = get_scoped(user, RawClothBatch, raw_cloth_batch_id, lock=True)
            if meters_returned > raw_batch.available_meters:
                raise GraphQLError(
                    f"Only {raw_batch.available_meters}m of batch {raw_batch.batch_number} "
                    f"is still in stock — {meters_returned}m cannot be returned."
                )
            raw_batch.available_meters -= meters_returned
            raw_batch.save(update_fields=["available_meters", "updated_at"])
        else:
            readymade = get_scoped(user, ReadymadeStock, readymade_stock_id, lock=True)
            if quantity_returned > readymade.quantity_available:
                raise GraphQLError(
                    f"Only {readymade.quantity_available} unit(s) still in stock — "
                    f"{quantity_returned} cannot be returned."
                )
            readymade.quantity_available -= quantity_returned
            readymade.save(update_fields=["quantity_available"])

        ret = SupplierReturn.objects.create(
            supplier=supplier,
            return_kind=return_kind,
            reason=reason,
            warehouse=warehouse,
            raw_cloth_batch=raw_batch,
            meters_returned=meters_returned,
            readymade_stock=readymade,
            quantity_returned=quantity_returned,
            created_by=user,
        )
    return ret
