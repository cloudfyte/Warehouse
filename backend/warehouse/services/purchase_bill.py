from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType,
    PurchaseBill, PurchaseBillItem, PurchaseOrder,
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
        gst_rate?,   # 0-28 — used only when gst_on_purchases is enabled
        notes? }
    """
    try:
        supplier = Supplier.objects.get(pk=supplier_id, active=True)
    except Supplier.DoesNotExist as exc:
        raise GraphQLError("Supplier not found.") from exc

    warehouse = get_warehouse(user, warehouse_id)

    if not items:
        raise GraphQLError("At least one item is required.")

    from warehouse.models import SystemSettings
    sys_settings = SystemSettings.load()
    gst_enabled = sys_settings.gst_on_purchases

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
        item_gst_records = []  # [(line_total, gst_rate)]

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

            item_gst_rate = Decimal(str(item.get("gst_rate") or 0))

            PurchaseBillItem.objects.create(
                bill=bill,
                item_kind=kind,
                cloth_category_id=item.get("cloth_category_id"),
                cloth_color_id=item.get("cloth_color_id"),
                total_meters=item.get("total_meters"),
                cost_per_meter=item.get("cost_per_meter"),
                bin_location=item.get("bin_location", ""),
                cloth_code=item.get("cloth_code", ""),
                item_type_id=item.get("item_type_id"),
                age_group=item.get("age_group", ""),
                size=item.get("size", ""),
                quantity=item.get("quantity", 0),
                unit_price=item.get("unit_price"),
                gst_rate=item_gst_rate,
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
                    age_group=item.get("age_group", ""),
                    size=item.get("size", ""),
                    warehouse=warehouse,
                    quantity_received=int(item.get("quantity", 0)),
                    quantity_available=int(item.get("quantity", 0)),
                    cost_price=Decimal(str(item.get("unit_price") or 0)),
                    notes=f"Bill {bill.bill_number}" + (f" — {item.get('notes', '')}" if item.get("notes") else ""),
                )

            computed_total += line_total
            item_gst_records.append((line_total, item_gst_rate))

        # GST computation
        if gst_enabled:
            tax_amount = sum(
                (lt * rate / 100).quantize(Decimal("0.01"))
                for lt, rate in item_gst_records if rate > 0
            )
            supplier_state = (supplier.state or "").strip().lower()
            company_state = (sys_settings.company_state or "").strip().lower()
            is_intra = bool(supplier_state and company_state and supplier_state == company_state)
            if is_intra and tax_amount > 0:
                cgst = (tax_amount / 2).quantize(Decimal("0.01"))
                sgst = tax_amount - cgst
                igst = Decimal("0.00")
            elif tax_amount > 0:
                cgst = Decimal("0.00")
                sgst = Decimal("0.00")
                igst = tax_amount
            else:
                cgst = sgst = igst = Decimal("0.00")
            final_total = computed_total + tax_amount
        else:
            tax_amount = cgst = sgst = igst = Decimal("0.00")
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

        bill.taxable_amount = computed_total
        bill.tax_amount = tax_amount
        bill.cgst_amount = cgst
        bill.sgst_amount = sgst
        bill.igst_amount = igst
        bill.total_amount = final_total
        bill.amount_paid = paid
        bill.payment_status = status
        bill.save(update_fields=[
            "taxable_amount", "tax_amount", "cgst_amount", "sgst_amount", "igst_amount",
            "total_amount", "amount_paid", "payment_status",
        ])

    return bill


def generate_bill_from_po(*, po_id, user):
    """
    Generate a PurchaseBill from a RECEIVED PurchaseOrder.
    Stock was already created when the PO was received — this only creates
    the accounting document (bill + bill items) for GST/payment tracking.
    """
    try:
        po = PurchaseOrder.objects.get(pk=po_id)
    except PurchaseOrder.DoesNotExist as exc:
        raise GraphQLError("Purchase order not found.") from exc

    if po.status not in (PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.VERIFIED):
        raise GraphQLError("Bill can only be generated for a received purchase order.")

    if PurchaseBill.objects.filter(source_po=po).exists():
        raise GraphQLError("A bill has already been generated for this purchase order.")

    from warehouse.models import SystemSettings
    sys_settings = SystemSettings.load()
    gst_enabled = sys_settings.gst_on_purchases

    with transaction.atomic():
        bill = PurchaseBill.objects.create(
            supplier=po.supplier,
            warehouse=po.warehouse,
            bill_date=timezone.now().date(),
            notes=f"Generated from {po.po_number}",
            source_po=po,
            created_by=user,
        )

        computed_total = Decimal("0.00")
        item_gst_records = []

        for item in po.items.all():
            if item.item_kind == "RAW_CLOTH":
                meters = Decimal(str(item.received_meters or item.ordered_meters or 0))
                cpm = Decimal(str(item.unit_price or 0))
                line_total = meters * cpm
                gst_rate = Decimal("0.00")
            else:
                qty = int(item.received_quantity or item.ordered_quantity or 0)
                unit = Decimal(str(item.unit_price or 0))
                line_total = qty * unit
                gst_rate = Decimal(str(item.item_type.gst_rate if item.item_type else 0))

            PurchaseBillItem.objects.create(
                bill=bill,
                item_kind=item.item_kind,
                cloth_category=item.cloth_category,
                cloth_color=item.cloth_color,
                total_meters=item.received_meters if item.item_kind == "RAW_CLOTH" else None,
                cost_per_meter=item.unit_price if item.item_kind == "RAW_CLOTH" else None,
                item_type=item.item_type,
                age_group=item.age_group or "",
                size=item.size or "",
                quantity=item.received_quantity if item.item_kind == "READYMADE" else 0,
                unit_price=item.unit_price if item.item_kind == "READYMADE" else None,
                gst_rate=gst_rate,
                total_price=line_total,
                notes=item.notes or "",
            )

            computed_total += line_total
            item_gst_records.append((line_total, gst_rate))

        if gst_enabled and item_gst_records:
            tax_amount = sum(
                (lt * rate / 100).quantize(Decimal("0.01"))
                for lt, rate in item_gst_records if rate > 0
            )
            supplier_state = (po.supplier.state or "").strip().lower()
            company_state = (sys_settings.company_state or "").strip().lower()
            is_intra = bool(supplier_state and company_state and supplier_state == company_state)
            if is_intra and tax_amount > 0:
                cgst = (tax_amount / 2).quantize(Decimal("0.01"))
                sgst = tax_amount - cgst
                igst = Decimal("0.00")
            elif tax_amount > 0:
                cgst = sgst = Decimal("0.00")
                igst = tax_amount
            else:
                cgst = sgst = igst = Decimal("0.00")
            final_total = computed_total + tax_amount
        else:
            tax_amount = cgst = sgst = igst = Decimal("0.00")
            final_total = computed_total

        bill.taxable_amount = computed_total
        bill.tax_amount = tax_amount
        bill.cgst_amount = cgst
        bill.sgst_amount = sgst
        bill.igst_amount = igst
        bill.total_amount = final_total
        bill.payment_status = PurchaseBill.PaymentStatus.PENDING
        bill.save(update_fields=[
            "taxable_amount", "tax_amount", "cgst_amount", "sgst_amount", "igst_amount",
            "total_amount", "payment_status",
        ])

    return bill
