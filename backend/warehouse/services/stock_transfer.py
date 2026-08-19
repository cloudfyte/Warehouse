"""Inter-warehouse stock transfer — create, dispatch, receive, cancel."""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import (
    FinishedProduct, RawClothBatch, StockTransfer, WarehouseLocation,
)
from warehouse.permissions import get_warehouse


def create_stock_transfer(
    *, user, from_warehouse_id, to_warehouse_id, transfer_kind,
    raw_cloth_batch_id=None, meters_to_transfer=None,
    finished_product_id=None, quantity_to_transfer=None,
    notes="",
):
    from_wh = get_warehouse(user, from_warehouse_id)
    try:
        to_wh = WarehouseLocation.objects.get(pk=to_warehouse_id, active=True)
    except WarehouseLocation.DoesNotExist as exc:
        raise GraphQLError("Destination warehouse not found.") from exc

    if from_wh.pk == to_wh.pk:
        raise GraphQLError("Source and destination warehouse must be different.")

    kind = transfer_kind.upper()

    with transaction.atomic():
        if kind == StockTransfer.TransferKind.RAW_CLOTH:
            if not raw_cloth_batch_id or not meters_to_transfer:
                raise GraphQLError("raw_cloth_batch_id and meters_to_transfer are required for RAW_CLOTH transfers.")
            meters = Decimal(str(meters_to_transfer))
            if meters <= 0:
                raise GraphQLError("meters_to_transfer must be positive.")
            try:
                batch = RawClothBatch.objects.select_for_update().get(pk=raw_cloth_batch_id, warehouse=from_wh)
            except RawClothBatch.DoesNotExist as exc:
                raise GraphQLError("Cloth batch not found in source warehouse.") from exc
            if batch.available_meters < meters:
                raise GraphQLError(
                    f"Insufficient stock: only {batch.available_meters}m available, requested {meters}m."
                )
            transfer = StockTransfer.objects.create(
                from_warehouse=from_wh,
                to_warehouse=to_wh,
                transfer_kind=kind,
                raw_cloth_batch=batch,
                meters_to_transfer=meters,
                notes=notes.strip(),
                created_by=user,
            )

        elif kind == StockTransfer.TransferKind.FINISHED:
            if not finished_product_id or not quantity_to_transfer:
                raise GraphQLError("finished_product_id and quantity_to_transfer are required for FINISHED transfers.")
            qty = int(quantity_to_transfer)
            if qty <= 0:
                raise GraphQLError("quantity_to_transfer must be positive.")
            try:
                fp = FinishedProduct.objects.select_for_update().get(pk=finished_product_id, warehouse=from_wh, active=True)
            except FinishedProduct.DoesNotExist as exc:
                raise GraphQLError("Finished product not found in source warehouse.") from exc
            if fp.quantity < qty:
                raise GraphQLError(
                    f"Insufficient stock: only {fp.quantity} pieces available, requested {qty}."
                )
            transfer = StockTransfer.objects.create(
                from_warehouse=from_wh,
                to_warehouse=to_wh,
                transfer_kind=kind,
                finished_product=fp,
                quantity_to_transfer=qty,
                notes=notes.strip(),
                created_by=user,
            )
        else:
            raise GraphQLError(f"Invalid transfer_kind: {transfer_kind}")

    return transfer


def dispatch_stock_transfer(*, transfer_id, user):
    """Mark IN_TRANSIT and deduct from source warehouse."""
    with transaction.atomic():
        try:
            transfer = StockTransfer.objects.select_for_update().get(pk=transfer_id)
        except StockTransfer.DoesNotExist as exc:
            raise GraphQLError("Transfer not found.") from exc
        if transfer.status != StockTransfer.Status.PENDING:
            raise GraphQLError("Only PENDING transfers can be dispatched.")

        if transfer.transfer_kind == StockTransfer.TransferKind.RAW_CLOTH:
            batch = RawClothBatch.objects.select_for_update().get(pk=transfer.raw_cloth_batch_id)
            if batch.available_meters < transfer.meters_to_transfer:
                raise GraphQLError("Insufficient stock to dispatch (stock may have changed since transfer was created).")
            batch.available_meters -= transfer.meters_to_transfer
            batch.save(update_fields=["available_meters"])
        else:
            fp = FinishedProduct.objects.select_for_update().get(pk=transfer.finished_product_id)
            if fp.quantity < transfer.quantity_to_transfer:
                raise GraphQLError("Insufficient stock to dispatch.")
            fp.quantity -= transfer.quantity_to_transfer
            fp.save(update_fields=["quantity", "updated_at"])

        transfer.status = StockTransfer.Status.IN_TRANSIT
        transfer.dispatched_at = timezone.now()
        transfer.save(update_fields=["status", "dispatched_at", "updated_at"])
    return transfer


def receive_stock_transfer(*, transfer_id, user):
    """Receive at destination warehouse — creates new batch or updates/creates finished product record."""
    with transaction.atomic():
        try:
            transfer = StockTransfer.objects.select_for_update(of=("self",)).select_related(
                "raw_cloth_batch__cloth_category", "raw_cloth_batch__cloth_color",
                "raw_cloth_batch__supplier",
                "finished_product__item_type", "finished_product__cloth_color",
                "finished_product__cloth_category",
                "to_warehouse",
            ).get(pk=transfer_id)
        except StockTransfer.DoesNotExist as exc:
            raise GraphQLError("Transfer not found.") from exc
        if transfer.status != StockTransfer.Status.IN_TRANSIT:
            raise GraphQLError("Only IN_TRANSIT transfers can be received.")

        if transfer.transfer_kind == StockTransfer.TransferKind.RAW_CLOTH:
            src = transfer.raw_cloth_batch
            RawClothBatch.objects.create(
                supplier=src.supplier,
                cloth_category=src.cloth_category,
                cloth_color=src.cloth_color,
                warehouse=transfer.to_warehouse,
                total_meters=transfer.meters_to_transfer,
                available_meters=transfer.meters_to_transfer,
                cost_per_meter=src.cost_per_meter,
                bin_location=src.bin_location,
                notes=f"Transferred from {transfer.from_warehouse.name} via {transfer.transfer_number}",
            )
        else:
            src = transfer.finished_product
            # Look for existing matching record at destination to merge into
            existing = FinishedProduct.objects.filter(
                item_type=src.item_type,
                cloth_color=src.cloth_color,
                cloth_category=src.cloth_category,
                size=src.size,
                warehouse=transfer.to_warehouse,
                source=src.source,
                active=True,
            ).first()
            if existing:
                existing.quantity += transfer.quantity_to_transfer
                existing.save(update_fields=["quantity", "updated_at"])
            else:
                FinishedProduct.objects.create(
                    item_type=src.item_type,
                    cloth_category=src.cloth_category,
                    cloth_color=src.cloth_color,
                    size=src.size,
                    source=src.source,
                    quantity=transfer.quantity_to_transfer,
                    warehouse=transfer.to_warehouse,
                    cost_price=src.cost_price,
                    sale_price=src.sale_price,
                    notes=f"Transferred from {transfer.from_warehouse.name} via {transfer.transfer_number}",
                )

        transfer.status = StockTransfer.Status.RECEIVED
        transfer.received_by = user
        transfer.received_at = timezone.now()
        transfer.save(update_fields=["status", "received_by", "received_at", "updated_at"])
    return transfer


def cancel_stock_transfer(*, transfer_id, user):
    """Cancel a PENDING transfer (stock was never deducted). IN_TRANSIT cannot be cancelled."""
    with transaction.atomic():
        try:
            transfer = StockTransfer.objects.select_for_update().get(pk=transfer_id)
        except StockTransfer.DoesNotExist as exc:
            raise GraphQLError("Transfer not found.") from exc
        if transfer.status not in (StockTransfer.Status.PENDING,):
            raise GraphQLError("Only PENDING transfers can be cancelled. Contact an admin for in-transit issues.")
        transfer.status = StockTransfer.Status.CANCELLED
        transfer.save(update_fields=["status", "updated_at"])
    return transfer
