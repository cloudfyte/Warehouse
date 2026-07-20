from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType, PurchaseOrder,
    PurchaseOrderItem, RawClothBatch, ReadymadeStock, Supplier,
)
from warehouse.permissions import get_warehouse


def create_purchase_order(*, user, supplier_id, order_type, warehouse_id,
                          order_date=None, expected_delivery=None, notes="", items):
    """
    items = list of dicts with keys:
      item_kind, cloth_category_id?, cloth_color_id?, ordered_meters?,
      item_type_id?, item_name?, size?, ordered_quantity?, unit_price?
    """
    try:
        supplier = Supplier.objects.get(pk=supplier_id, active=True)
    except Supplier.DoesNotExist as exc:
        raise GraphQLError("Supplier not found.") from exc

    warehouse = get_warehouse(user, warehouse_id)

    with transaction.atomic():
        po = PurchaseOrder.objects.create(
            supplier=supplier,
            order_type=order_type,
            warehouse=warehouse,
            order_date=order_date or __import__("django.utils.timezone", fromlist=["now"]).now().date(),
            expected_delivery=expected_delivery,
            notes=notes.strip(),
            created_by=user,
        )
        total = Decimal("0.00")
        for item in items:
            _validate_item(item)
            unit_price = Decimal(str(item.get("unit_price", 0)))
            if item["item_kind"] == "RAW_CLOTH":
                meters = Decimal(str(item.get("ordered_meters", 0)))
                line_total = unit_price * meters
            else:
                qty = int(item.get("ordered_quantity", 0))
                line_total = unit_price * qty

            PurchaseOrderItem.objects.create(
                purchase_order=po,
                item_kind=item["item_kind"],
                cloth_category_id=item.get("cloth_category_id"),
                cloth_color_id=item.get("cloth_color_id"),
                ordered_meters=item.get("ordered_meters"),
                item_type_id=item.get("item_type_id"),
                item_name=item.get("item_name", ""),
                size=item.get("size", ""),
                ordered_quantity=item.get("ordered_quantity", 0),
                unit_price=unit_price,
                total_price=line_total,
                notes=item.get("notes", ""),
            )
            total += line_total
        po.total_amount = total
        po.save(update_fields=["total_amount"])
    return po


def update_purchase_order_status(*, id, status, actual_delivery=None):
    status = status.upper()
    if status not in PurchaseOrder.Status.values:
        raise GraphQLError("Invalid status.")
    try:
        po = PurchaseOrder.objects.get(pk=id)
    except PurchaseOrder.DoesNotExist as exc:
        raise GraphQLError("Purchase order not found.") from exc
    po.status = status
    if actual_delivery:
        po.actual_delivery = actual_delivery
    po.save()
    return po


def receive_purchase_order(*, po_id, user, receipt_items):
    """
    Mark PO as received and create raw cloth batches / readymade stock records.
    receipt_items = [{po_item_id, received_meters?, received_quantity?, bin_location?, cost_per_meter?, notes?}]
    """
    try:
        po = PurchaseOrder.objects.select_related("supplier", "warehouse").get(pk=po_id)
    except PurchaseOrder.DoesNotExist as exc:
        raise GraphQLError("Purchase order not found.") from exc
    if po.status not in (PurchaseOrder.Status.PLACED, PurchaseOrder.Status.DISPATCHED):
        raise GraphQLError("Only PLACED or DISPATCHED orders can be received.")

    with transaction.atomic():
        for receipt in receipt_items:
            try:
                poi = PurchaseOrderItem.objects.select_for_update().get(pk=receipt["po_item_id"], purchase_order=po)
            except PurchaseOrderItem.DoesNotExist as exc:
                raise GraphQLError("PO item not found.") from exc

            if poi.item_kind == PurchaseOrderItem.ItemKind.RAW_CLOTH:
                meters = Decimal(str(receipt.get("received_meters", poi.ordered_meters or 0)))
                poi.received_meters = meters
                poi.save(update_fields=["received_meters"])
                RawClothBatch.objects.create(
                    po_item=poi,
                    supplier=po.supplier,
                    cloth_category=poi.cloth_category,
                    cloth_color=poi.cloth_color,
                    warehouse=po.warehouse,
                    total_meters=meters,
                    available_meters=meters,
                    cost_per_meter=Decimal(str(receipt.get("cost_per_meter", poi.unit_price or 0))),
                    bin_location=receipt.get("bin_location", ""),
                    notes=receipt.get("notes", ""),
                )
            else:
                qty = int(receipt.get("received_quantity", poi.ordered_quantity or 0))
                poi.received_quantity = qty
                poi.save(update_fields=["received_quantity"])
                ReadymadeStock.objects.create(
                    po_item=poi,
                    supplier=po.supplier,
                    item_type=poi.item_type,
                    cloth_color=poi.cloth_color,
                    size=poi.size,
                    warehouse=po.warehouse,
                    quantity_received=qty,
                    quantity_available=qty,
                    cost_price=poi.unit_price,
                    notes=receipt.get("notes", ""),
                )

        po.status = PurchaseOrder.Status.RECEIVED
        from django.utils import timezone
        po.actual_delivery = timezone.now().date()
        po.received_by = user
        po.save(update_fields=["status", "actual_delivery", "received_by"])
    return po


def _validate_item(item):
    kind = item.get("item_kind", "").upper()
    if kind == "RAW_CLOTH":
        if not item.get("cloth_category_id"):
            raise GraphQLError("cloth_category_id is required for raw cloth items.")
        if not item.get("cloth_color_id"):
            raise GraphQLError("cloth_color_id is required for raw cloth items.")
    elif kind == "READYMADE":
        if not item.get("item_type_id") and not item.get("item_name"):
            raise GraphQLError("item_type_id or item_name is required for readymade items.")
    else:
        raise GraphQLError(f"item_kind must be RAW_CLOTH or READYMADE, got '{kind}'.")
