"""Quotation creation, status updates, and conversion to Sales Order."""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    Buyer, FinishedProduct, Quotation, QuotationItem, SalesOrder,
)
from warehouse.permissions import get_warehouse


def create_quotation(*, user, buyer_id, warehouse_id, items, discount=0, notes="", validity_date=None):
    """items = [{finished_product_id, quantity, unit_price}]"""
    if not items:
        raise GraphQLError("At least one item is required.")
    discount_amt = Decimal(str(discount))
    if discount_amt < 0:
        raise GraphQLError("Discount cannot be negative.")

    try:
        buyer = Buyer.objects.get(pk=buyer_id, active=True)
    except Buyer.DoesNotExist as exc:
        raise GraphQLError("Buyer not found.") from exc
    warehouse = get_warehouse(user, warehouse_id)

    with transaction.atomic():
        qt = Quotation.objects.create(
            buyer=buyer,
            warehouse=warehouse,
            validity_date=validity_date,
            discount=discount_amt,
            notes=notes.strip(),
            created_by=user,
        )
        subtotal = Decimal("0.00")
        item_gst_records = []

        for item in items:
            fp_id = item["finished_product_id"]
            qty = int(item["quantity"])
            unit_price = Decimal(str(item["unit_price"]))

            if qty <= 0:
                raise GraphQLError("Item quantity must be greater than zero.")
            if unit_price < 0:
                raise GraphQLError("Item unit price cannot be negative.")

            try:
                fp = FinishedProduct.objects.select_related("item_type").get(pk=fp_id, active=True)
            except FinishedProduct.DoesNotExist as exc:
                raise GraphQLError(f"Finished product {fp_id} not found.") from exc
            line_total = unit_price * qty
            QuotationItem.objects.create(
                quotation=qt, finished_product=fp, quantity=qty,
                unit_price=unit_price, total_price=line_total,
            )
            subtotal += line_total
            item_gst_records.append((line_total, Decimal(str(fp.item_type.gst_rate or 0))))

        # Per-item GST computation (same logic as sales orders)
        discount_ratio = discount_amt / subtotal if subtotal > 0 else Decimal("0")
        tax_amount = sum(
            ((lt * (1 - discount_ratio)).quantize(Decimal("0.01")) * rate / 100).quantize(Decimal("0.01"))
            for lt, rate in item_gst_records if rate > 0
        )
        qt.subtotal = subtotal
        qt.tax_amount = tax_amount
        qt.total_amount = (subtotal - discount_amt) + tax_amount
        qt.save(update_fields=["subtotal", "discount", "tax_amount", "total_amount"])
    return qt


def update_quotation_status(*, id, status):
    status = status.upper()
    if status not in Quotation.Status.values:
        raise GraphQLError("Invalid status.")
    try:
        qt = Quotation.objects.get(pk=id)
    except Quotation.DoesNotExist as exc:
        raise GraphQLError("Quotation not found.") from exc
    if qt.status in (Quotation.Status.ACCEPTED, Quotation.Status.REJECTED):
        raise GraphQLError(f"Cannot change status of a {qt.status.lower()} quotation.")
    qt.status = status
    qt.save(update_fields=["status", "updated_at"])
    return qt


def convert_quotation_to_so(*, id, user, payment_mode="CREDIT", amount_paid=None):
    """Convert an ACCEPTED quotation into a real Sales Order."""
    try:
        qt = Quotation.objects.select_related("buyer", "warehouse").prefetch_related(
            "items__finished_product"
        ).get(pk=id)
    except Quotation.DoesNotExist as exc:
        raise GraphQLError("Quotation not found.") from exc
    if qt.status != Quotation.Status.ACCEPTED:
        raise GraphQLError("Only ACCEPTED quotations can be converted to a Sales Order.")
    if qt.converted_to_id:
        raise GraphQLError("This quotation has already been converted.")

    from warehouse.services.sales import create_sales_order
    items = [
        {
            "finished_product_id": str(it.finished_product_id),
            "quantity": it.quantity,
            "unit_price": float(it.unit_price),
        }
        for it in qt.items.all()
    ]
    so = create_sales_order(
        user=user,
        buyer_id=str(qt.buyer_id),
        payment_mode=payment_mode,
        warehouse_id=str(qt.warehouse_id),
        discount=float(qt.discount),
        notes=qt.notes,
        amount_paid=amount_paid,
        items=items,
    )
    qt.converted_to = so
    qt.status = Quotation.Status.ACCEPTED
    qt.save(update_fields=["converted_to", "status", "updated_at"])
    return so
