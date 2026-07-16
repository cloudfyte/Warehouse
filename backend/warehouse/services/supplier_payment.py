"""Supplier payment tracking — record payments against purchase bills."""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import PurchaseBill, SupplierPayment


def create_supplier_payment(*, user, bill_id, amount, payment_date=None, payment_mode="CASH",
                             reference="", notes=""):
    try:
        bill = PurchaseBill.objects.select_for_update().get(pk=bill_id)
    except PurchaseBill.DoesNotExist as exc:
        raise GraphQLError("Purchase bill not found.") from exc

    amt = Decimal(str(amount))
    if amt <= 0:
        raise GraphQLError("Payment amount must be greater than zero.")

    if bill.amount_paid + amt > bill.total_amount:
        remaining = bill.total_amount - bill.amount_paid
        raise GraphQLError(
            f"Payment of ₹{amt} would exceed outstanding balance ₹{remaining:.2f}."
        )

    with transaction.atomic():
        payment = SupplierPayment.objects.create(
            bill=bill,
            amount=amt,
            payment_mode=payment_mode.upper(),
            reference=reference.strip(),
            notes=notes.strip(),
            created_by=user,
            **({"payment_date": payment_date} if payment_date else {}),
        )

        bill.amount_paid += amt
        if bill.amount_paid >= bill.total_amount:
            bill.payment_status = PurchaseBill.PaymentStatus.PAID
        else:
            bill.payment_status = PurchaseBill.PaymentStatus.PARTIAL
        bill.save(update_fields=["amount_paid", "payment_status"])

    return payment


def delete_supplier_payment(*, user, payment_id):
    try:
        payment = SupplierPayment.objects.select_related("bill").get(pk=payment_id)
    except SupplierPayment.DoesNotExist as exc:
        raise GraphQLError("Supplier payment not found.") from exc

    with transaction.atomic():
        bill = PurchaseBill.objects.select_for_update().get(pk=payment.bill_id)
        bill.amount_paid -= payment.amount
        if bill.amount_paid <= 0:
            bill.amount_paid = Decimal("0.00")
            bill.payment_status = PurchaseBill.PaymentStatus.PENDING
        elif bill.amount_paid < bill.total_amount:
            bill.payment_status = PurchaseBill.PaymentStatus.PARTIAL
        bill.save(update_fields=["amount_paid", "payment_status"])
        payment.delete()
