"""Services for buyer and supplier returns."""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    BuyerReturn, Buyer, FinishedProduct, SalesOrder,
    SupplierReturn, Supplier, RawClothBatch, ReadymadeStock,
    WarehouseLocation,
)


def create_buyer_return(*, user, buyer_id, finished_product_id, quantity, condition, reason,
                         warehouse_id, sales_order_id=None):
    try:
        buyer = Buyer.objects.get(pk=buyer_id)
    except Buyer.DoesNotExist as exc:
        raise GraphQLError("Buyer not found.") from exc
    try:
        product = FinishedProduct.objects.get(pk=finished_product_id)
    except FinishedProduct.DoesNotExist as exc:
        raise GraphQLError("Finished product not found.") from exc
    try:
        warehouse = WarehouseLocation.objects.get(pk=warehouse_id)
    except WarehouseLocation.DoesNotExist as exc:
        raise GraphQLError("Warehouse not found.") from exc
    if quantity <= 0:
        raise GraphQLError("Quantity must be greater than zero.")

    sales_order = None
    if sales_order_id:
        try:
            sales_order = SalesOrder.objects.get(pk=sales_order_id)
        except SalesOrder.DoesNotExist:
            pass

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


def process_buyer_return(*, id, status):
    """Advance a buyer return: PENDING→RECEIVED, RECEIVED→RESTOCKED or DISCARDED.
    RESTOCKED puts the quantity back into finished product stock."""
    status = status.upper()
    valid = (BuyerReturn.Status.RECEIVED, BuyerReturn.Status.RESTOCKED, BuyerReturn.Status.DISCARDED)
    if status not in valid:
        raise GraphQLError(f"Invalid status '{status}'. Must be one of: RECEIVED, RESTOCKED, DISCARDED.")
    try:
        ret = BuyerReturn.objects.get(pk=id)
    except BuyerReturn.DoesNotExist as exc:
        raise GraphQLError("Return not found.") from exc

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
    try:
        warehouse = WarehouseLocation.objects.get(pk=warehouse_id)
    except WarehouseLocation.DoesNotExist as exc:
        raise GraphQLError("Warehouse not found.") from exc

    return_kind = return_kind.upper()
    if return_kind not in ("RAW_CLOTH", "READYMADE"):
        raise GraphQLError("Invalid return kind.")

    raw_batch = None
    readymade = None
    if return_kind == "RAW_CLOTH":
        if not raw_cloth_batch_id or not meters_returned:
            raise GraphQLError("Raw cloth batch and meters returned are required for RAW_CLOTH returns.")
        try:
            raw_batch = RawClothBatch.objects.get(pk=raw_cloth_batch_id)
        except RawClothBatch.DoesNotExist as exc:
            raise GraphQLError("Raw cloth batch not found.") from exc
        meters_returned = Decimal(str(meters_returned))
        if meters_returned <= 0:
            raise GraphQLError("Meters returned must be greater than zero.")
    else:
        if not readymade_stock_id or not quantity_returned:
            raise GraphQLError("Readymade stock and quantity are required for READYMADE returns.")
        try:
            readymade = ReadymadeStock.objects.get(pk=readymade_stock_id)
        except ReadymadeStock.DoesNotExist as exc:
            raise GraphQLError("Readymade stock not found.") from exc
        if quantity_returned <= 0:
            raise GraphQLError("Quantity must be greater than zero.")

    with transaction.atomic():
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
