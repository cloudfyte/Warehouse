"""Stock adjustment service — damage, loss, correction, surplus."""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import FinishedProduct, RawClothBatch, StockAdjustment, WarehouseLocation


def create_stock_adjustment(*, user, item_kind, quantity_change, adjustment_type,
                             reason, warehouse_id, raw_cloth_batch_id=None, finished_product_id=None):
    qty = Decimal(str(quantity_change))
    if qty == 0:
        raise GraphQLError("Quantity change cannot be zero.")

    try:
        warehouse = WarehouseLocation.objects.get(pk=warehouse_id)
    except WarehouseLocation.DoesNotExist as exc:
        raise GraphQLError("Warehouse not found.") from exc

    with transaction.atomic():
        if item_kind == StockAdjustment.ItemKind.RAW_CLOTH:
            if not raw_cloth_batch_id:
                raise GraphQLError("raw_cloth_batch_id is required for RAW_CLOTH adjustment.")
            try:
                batch = RawClothBatch.objects.select_for_update().get(pk=raw_cloth_batch_id, active=True)
            except RawClothBatch.DoesNotExist as exc:
                raise GraphQLError("Raw cloth batch not found.") from exc

            new_available = batch.available_meters + qty
            if new_available < 0:
                raise GraphQLError(
                    f"Adjustment would make available meters negative "
                    f"({batch.available_meters:.2f}m + ({qty:.2f}m) = {new_available:.2f}m)."
                )
            batch.available_meters = new_available
            batch.save(update_fields=["available_meters", "updated_at"])

            adj = StockAdjustment.objects.create(
                item_kind=item_kind,
                raw_cloth_batch=batch,
                quantity_change=qty,
                adjustment_type=adjustment_type.upper(),
                reason=reason.strip(),
                warehouse=warehouse,
                created_by=user,
            )

        elif item_kind == StockAdjustment.ItemKind.FINISHED_PRODUCT:
            if not finished_product_id:
                raise GraphQLError("finished_product_id is required for FINISHED_PRODUCT adjustment.")
            try:
                fp = FinishedProduct.objects.select_for_update().get(pk=finished_product_id, active=True)
            except FinishedProduct.DoesNotExist as exc:
                raise GraphQLError("Finished product not found.") from exc

            # For finished products, quantity_change is integer pieces
            pieces = int(qty)
            new_qty = fp.quantity + pieces
            if new_qty < 0:
                raise GraphQLError(
                    f"Adjustment would make quantity negative "
                    f"({fp.quantity} pcs + {pieces} pcs = {new_qty} pcs)."
                )
            fp.quantity = new_qty
            fp.save(update_fields=["quantity", "updated_at"])

            adj = StockAdjustment.objects.create(
                item_kind=item_kind,
                finished_product=fp,
                quantity_change=Decimal(str(pieces)),
                adjustment_type=adjustment_type.upper(),
                reason=reason.strip(),
                warehouse=warehouse,
                created_by=user,
            )
        else:
            raise GraphQLError(f"Unknown item_kind: {item_kind}")

    return adj


def delete_stock_adjustment(*, user, adjustment_id):
    try:
        adj = StockAdjustment.objects.select_related(
            "raw_cloth_batch", "finished_product"
        ).get(pk=adjustment_id)
    except StockAdjustment.DoesNotExist as exc:
        raise GraphQLError("Stock adjustment not found.") from exc

    with transaction.atomic():
        # Reverse the adjustment
        if adj.item_kind == StockAdjustment.ItemKind.RAW_CLOTH and adj.raw_cloth_batch:
            batch = RawClothBatch.objects.select_for_update().get(pk=adj.raw_cloth_batch_id)
            batch.available_meters -= adj.quantity_change
            if batch.available_meters < 0:
                raise GraphQLError("Cannot delete: reversal would make available meters negative.")
            batch.save(update_fields=["available_meters", "updated_at"])

        elif adj.item_kind == StockAdjustment.ItemKind.FINISHED_PRODUCT and adj.finished_product:
            fp = FinishedProduct.objects.select_for_update().get(pk=adj.finished_product_id)
            fp.quantity -= int(adj.quantity_change)
            if fp.quantity < 0:
                raise GraphQLError("Cannot delete: reversal would make quantity negative.")
            fp.save(update_fields=["quantity", "updated_at"])

        adj.delete()
