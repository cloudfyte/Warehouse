from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType,
    PurchaseBill, PurchaseBillItem,
    RawClothBatch, ReadymadeStock, Supplier,
)
from warehouse.permissions import get_warehouse


def create_purchase_bill(
    *, user, supplier_id, warehouse_id,
    items, total_amount=None, amount_paid=0,
    invoice_ref="", bill_image="", notes="", bill_date=None,
):
    """
    Create a purchase bill and immediately receive all items into stock.
    items = list of dicts:
      { item_kind, cloth_category_id?, cloth_color_id?, total_meters?,
        cost_per_meter?, bin_location?, cloth_code?,
        item_type_id?, size?, quantity?, unit_price?,
        notes? }
    """
    try:
        supplier = Supplier.objects.get(pk=supplier_id, active=True)
    except Supplier.DoesNotExist as exc:
        raise GraphQLError("Supplier not found.") from exc

    warehouse = get_warehouse(user, warehouse_id)

    if not items:
        raise GraphQLError("At least one item is required.")

    with transaction.atomic():
        bill = PurchaseBill.objects.create(
            supplier=supplier,
            warehouse=warehouse,
            bill_date=bill_date or timezone.now().date(),
            invoice_ref=invoice_ref.strip(),
            bill_image=bill_image,
            notes=notes.strip(),
            created_by=user,
        )

        computed_total = Decimal("0.00")

        for item in items:
            kind = item.get("item_kind", "").upper()
            if kind not in ("RAW_CLOTH", "READYMADE"):
                raise GraphQLError(f"item_kind must be RAW_CLOTH or READYMADE, got '{kind}'.")

            if kind == "RAW_CLOTH":
                if not item.get("cloth_category_id"):
                    raise GraphQLError("cloth_category_id is required for raw cloth items.")
                if not item.get("cloth_color_id"):
                    raise GraphQLError("cloth_color_id is required for raw cloth items.")
                meters = Decimal(str(item.get("total_meters") or 0))
                cpm = Decimal(str(item.get("cost_per_meter") or 0))
                line_total = meters * cpm
            else:
                if not item.get("item_type_id"):
                    raise GraphQLError("item_type_id is required for readymade items.")
                qty = int(item.get("quantity") or 0)
                unit = Decimal(str(item.get("unit_price") or 0))
                line_total = qty * unit

            bill_item = PurchaseBillItem.objects.create(
                bill=bill,
                item_kind=kind,
                cloth_category_id=item.get("cloth_category_id"),
                cloth_color_id=item.get("cloth_color_id"),
                total_meters=item.get("total_meters"),
                cost_per_meter=item.get("cost_per_meter"),
                bin_location=item.get("bin_location", ""),
                cloth_code=item.get("cloth_code", ""),
                item_type_id=item.get("item_type_id"),
                size=item.get("size", ""),
                quantity=item.get("quantity", 0),
                unit_price=item.get("unit_price"),
                total_price=line_total,
                notes=item.get("notes", ""),
            )

            # Immediately create stock record
            if kind == "RAW_CLOTH":
                RawClothBatch.objects.create(
                    supplier=supplier,
                    cloth_category_id=item["cloth_category_id"],
                    cloth_color_id=item["cloth_color_id"],
                    warehouse=warehouse,
                    total_meters=meters,
                    available_meters=meters,
                    cost_per_meter=cpm,
                    cloth_code=item.get("cloth_code", ""),
                    bin_location=item.get("bin_location", ""),
                    notes=f"Bill {bill.bill_number}" + (f" — {item.get('notes', '')}" if item.get("notes") else ""),
                )
            else:
                try:
                    it = ItemType.objects.get(pk=item["item_type_id"])
                except ItemType.DoesNotExist as exc:
                    raise GraphQLError("Item type not found.") from exc
                ReadymadeStock.objects.create(
                    supplier=supplier,
                    item_type=it,
                    cloth_color_id=item.get("cloth_color_id"),
                    size=item.get("size", ""),
                    warehouse=warehouse,
                    quantity_received=int(item.get("quantity", 0)),
                    quantity_available=int(item.get("quantity", 0)),
                    cost_price=Decimal(str(item.get("unit_price") or 0)),
                    notes=f"Bill {bill.bill_number}" + (f" — {item.get('notes', '')}" if item.get("notes") else ""),
                )

            computed_total += line_total

        # Use provided total_amount if given (manual override), else computed
        final_total = Decimal(str(total_amount)) if total_amount is not None else computed_total
        paid = Decimal(str(amount_paid))

        if paid < 0:
            raise GraphQLError("Amount paid cannot be negative.")
        if paid > final_total:
            raise GraphQLError("Amount paid cannot exceed total amount.")

        if paid == 0:
            status = PurchaseBill.PaymentStatus.PENDING
        elif paid >= final_total:
            status = PurchaseBill.PaymentStatus.PAID
        else:
            status = PurchaseBill.PaymentStatus.PARTIAL

        bill.total_amount = final_total
        bill.amount_paid = paid
        bill.payment_status = status
        bill.save(update_fields=["total_amount", "amount_paid", "payment_status"])

    return bill
