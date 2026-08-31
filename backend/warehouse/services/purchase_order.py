from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType, PurchaseOrder,
    PurchaseOrderItem, RawClothBatch, ReadymadeStock, Supplier,
)
from warehouse.permissions import get_scoped, get_warehouse, scoped


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
                age_group=item.get("age_group", ""),
                size=item.get("size", ""),
                ordered_quantity=item.get("ordered_quantity", 0),
                unit_price=unit_price,
                total_price=line_total,
                notes=item.get("notes", ""),
            )
            total += line_total
        po.total_amount = total
        po.save(update_fields=["total_amount"])

    # WhatsApp notification to supplier when PO is created
    supplier_phone = supplier.whatsapp or supplier.phone
    if supplier_phone:
        from warehouse.tasks import send_whatsapp_order_notification
        from warehouse.models import SystemSettings
        settings = SystemSettings.load()
        if settings.wa_enabled:
            msg = (
                f"Hello {supplier.name},\n"
                f"A new purchase order *{po.po_number}* has been placed with you by *{settings.company_name}*.\n"
                f"Order value: {settings.currency_symbol}{po.total_amount:.2f}\n"
                f"Please confirm and dispatch at the earliest. Thank you!"
            )
            send_whatsapp_order_notification.delay(supplier_phone, msg)

    return po


def update_purchase_order_status(*, user, id, status, actual_delivery=None):
    status = status.upper()
    if status not in PurchaseOrder.Status.values:
        raise GraphQLError("Invalid status.")

    with transaction.atomic():
        po = get_scoped(user, PurchaseOrder, id, lock=True)

        # Reopening a received order let it be received again, and every receipt
        # mints fresh RawClothBatch / ReadymadeStock rows — the stock doubles.
        if po.status == PurchaseOrder.Status.CANCELLED:
            raise GraphQLError("This order is cancelled and cannot be changed.")
        if po.status in (PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.VERIFIED):
            if status != PurchaseOrder.Status.VERIFIED:
                raise GraphQLError(
                    f"Goods for this order are already in stock ({po.status.lower()}); "
                    f"it can only move on to verified."
                )
        # A part-received order advances by booking the rest of the delivery, not
        # by picking a status from a dropdown. Marking it received by hand would
        # close it while goods are still owed; sending it back to placed would
        # contradict the stock already booked against it. Verifying is allowed —
        # that is how you short-close an order the supplier never completed.
        if po.status == PurchaseOrder.Status.PARTIALLY_RECEIVED:
            if status not in (PurchaseOrder.Status.VERIFIED, PurchaseOrder.Status.CANCELLED):
                raise GraphQLError(
                    "This order is part-received. Receive the rest of the goods to complete it, "
                    "or verify it to close it short."
                )

        po.status = status
        if actual_delivery:
            po.actual_delivery = actual_delivery
        po.save()
    return po


def _requested(receipt, key):
    """
    The amount on one receipt line, or None when the caller left it out.

    ``.get(key, default)`` would be wrong here: a client that explicitly sends
    zero means zero, and that has to reach the validation below rather than be
    quietly swapped for the whole outstanding balance.
    """
    value = receipt.get(key)
    return None if value is None or value == "" else value


def receive_purchase_order(*, po_id, user, receipt_items):
    """
    Book a delivery against a purchase order and create the stock it brought in.

    A supplier rarely sends 100 pieces in one lorry — 30 arrive now, 30 in two
    days, the rest next week. So a receipt is cumulative: each call adds to what
    an item has already received and leaves the order open at
    PARTIALLY_RECEIVED until every line is complete. Only then does it become
    RECEIVED.

    Every delivery still creates its own RawClothBatch / ReadymadeStock row, so
    those rows are the receipt history — each one carries the date, the cost and
    the bin it landed in for that particular lorry.

    receipt_items = [{po_item_id, received_meters?, received_quantity?, bin_location?, cost_per_meter?, notes?}]
    A line whose outstanding balance is already zero is skipped, so the caller
    can send every line of the order each time without special-casing.
    """
    receivable = (PurchaseOrder.Status.PLACED,
                  PurchaseOrder.Status.DISPATCHED,
                  PurchaseOrder.Status.PARTIALLY_RECEIVED)
    with transaction.atomic():
        # The status check has to hold the row: read outside the lock, two clicks
        # on Receive both saw PLACED and each created a full set of stock rows.
        po = (scoped(user, PurchaseOrder)
              .select_for_update()
              .select_related("supplier", "warehouse")
              .filter(pk=po_id).first())
        if po is None:
            raise GraphQLError("Purchase order not found in your warehouses.")
        if po.status not in receivable:
            raise GraphQLError(
                f"Only placed, dispatched or part-received orders can be received — "
                f"this one is {po.get_status_display().lower()}."
            )

        booked_anything = False
        for receipt in receipt_items:
            try:
                poi = PurchaseOrderItem.objects.select_for_update().get(pk=receipt["po_item_id"], purchase_order=po)
            except PurchaseOrderItem.DoesNotExist as exc:
                raise GraphQLError("PO item not found.") from exc

            if poi.item_kind == PurchaseOrderItem.ItemKind.RAW_CLOTH:
                ordered = poi.ordered_meters or Decimal("0")
                already = poi.received_meters or Decimal("0")
                outstanding = ordered - already
                asked = _requested(receipt, "received_meters")
                if asked is None:
                    if outstanding <= 0:
                        continue  # this line is already complete
                    meters = outstanding
                else:
                    meters = Decimal(str(asked))
                if meters <= 0:
                    raise GraphQLError("Received meters must be greater than zero.")
                if meters > outstanding:
                    raise GraphQLError(
                        f"Only {outstanding}m of this item are still outstanding "
                        f"({already}m of {ordered}m already received). "
                        f"Edit the order if the supplier sent more than you ordered."
                    )
                poi.received_meters = already + meters
                poi.save(update_fields=["received_meters"])
                RawClothBatch.objects.create(
                    po_item=poi,
                    supplier=po.supplier,
                    cloth_category=poi.cloth_category,
                    cloth_color=poi.cloth_color,
                    warehouse=po.warehouse,
                    total_meters=meters,
                    available_meters=meters,
                    cost_per_meter=Decimal(str(receipt.get("cost_per_meter") or poi.unit_price or 0)),
                    bin_location=receipt.get("bin_location", ""),
                    notes=receipt.get("notes", ""),
                )
                booked_anything = True
            else:
                ordered = poi.ordered_quantity or 0
                already = poi.received_quantity or 0
                outstanding = ordered - already
                asked = _requested(receipt, "received_quantity")
                if asked is None:
                    if outstanding <= 0:
                        continue  # this line is already complete
                    qty = outstanding
                else:
                    qty = int(asked)
                if qty <= 0:
                    raise GraphQLError("Received quantity must be greater than zero.")
                if qty > outstanding:
                    raise GraphQLError(
                        f"Only {outstanding} pieces of this item are still outstanding "
                        f"({already} of {ordered} already received). "
                        f"Edit the order if the supplier sent more than you ordered."
                    )
                poi.received_quantity = already + qty
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
                booked_anything = True

        if not booked_anything:
            raise GraphQLError("Nothing left to receive on this order — every item is already complete.")

        from django.utils import timezone
        po.status = (PurchaseOrder.Status.RECEIVED if _fully_received(po)
                     else PurchaseOrder.Status.PARTIALLY_RECEIVED)
        po.actual_delivery = timezone.now().date()
        po.received_by = user
        po.save(update_fields=["status", "actual_delivery", "received_by"])
    return po


def _fully_received(po):
    """True once every line of the order has had its full ordered amount delivered."""
    for item in po.items.all():
        if item.item_kind == PurchaseOrderItem.ItemKind.RAW_CLOTH:
            if (item.received_meters or Decimal("0")) < (item.ordered_meters or Decimal("0")):
                return False
        elif (item.received_quantity or 0) < (item.ordered_quantity or 0):
            return False
    return True


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
