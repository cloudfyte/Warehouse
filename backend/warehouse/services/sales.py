"""Sales order creation, status updates, and credit management."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from graphql import GraphQLError

from warehouse.models import (
    Buyer, CreditPayment, CreditTransaction,
    FinishedProduct, SalesOrder, SalesOrderItem,
)
from warehouse.permissions import get_scoped, get_warehouse, scoped


def create_sales_order(*, user, buyer_id, payment_mode, warehouse_id,
                       order_date=None, expected_delivery=None, discount=0, notes="",
                       amount_paid=None, items):
    """
    items = [{finished_product_id, quantity, unit_price}]
    """
    try:
        buyer = Buyer.objects.get(pk=buyer_id, active=True)
    except Buyer.DoesNotExist as exc:
        raise GraphQLError("Buyer not found.") from exc
    warehouse = get_warehouse(user, warehouse_id)

    if not items:
        raise GraphQLError("At least one item is required.")
    discount_amt = Decimal(str(discount))
    if discount_amt < 0:
        raise GraphQLError("Discount cannot be negative.")

    with transaction.atomic():
        so = SalesOrder.objects.create(
            buyer=buyer,
            payment_mode=payment_mode.upper(),
            warehouse=warehouse,
            order_date=order_date or __import__("django.utils.timezone", fromlist=["now"]).now().date(),
            expected_delivery=expected_delivery,
            discount=discount_amt,
            notes=notes.strip(),
            created_by=user,
        )
        subtotal = Decimal("0.00")
        item_gst_records = []  # [(line_total, gst_rate)]

        for item in items:
            fp_id = item.get("finished_product_id")
            set_id = item.get("product_set_id")
            qty = int(item["quantity"])
            unit_price = Decimal(str(item["unit_price"]))

            if qty <= 0:
                raise GraphQLError("Item quantity must be greater than zero.")
            if unit_price < 0:
                raise GraphQLError("Item unit price cannot be negative.")
            if bool(fp_id) == bool(set_id):
                raise GraphQLError("A line sells either a product or a set, not both or neither.")

            line_total = unit_price * qty

            if set_id:
                # A built set already holds its pieces — they left the individual
                # counts when it was built — so selling one only decrements here.
                from warehouse.models import ProductSet

                product_set = get_scoped(user, ProductSet, set_id, lock=True, active=True)
                if product_set.quantity < qty:
                    raise GraphQLError(
                        f"Insufficient stock for {product_set.set_number}: "
                        f"only {product_set.quantity} set(s) available."
                    )
                product_set.quantity -= qty
                product_set.save(update_fields=["quantity", "updated_at"])

                SalesOrderItem.objects.create(
                    sales_order=so, product_set=product_set, quantity=qty,
                    unit_price=unit_price, total_price=line_total,
                )
                gst_rate = Decimal(str(product_set.item_type.gst_rate or 0))
            else:
                fp = get_scoped(user, FinishedProduct, fp_id, lock=True, active=True)
                if fp.quantity < qty:
                    raise GraphQLError(f"Insufficient stock for {fp.sku}: only {fp.quantity} available.")

                fp.quantity -= qty
                fp.save(update_fields=["quantity", "updated_at"])

                SalesOrderItem.objects.create(
                    sales_order=so, finished_product=fp, quantity=qty,
                    unit_price=unit_price, total_price=line_total,
                )
                gst_rate = Decimal(str(fp.item_type.gst_rate or 0))

            subtotal += line_total
            item_gst_records.append((line_total, gst_rate))

        # Per-item GST computation
        discount_ratio = discount_amt / subtotal if subtotal > 0 else Decimal("0")
        tax_amount = sum(
            ((lt * (1 - discount_ratio)).quantize(Decimal("0.01")) * rate / 100).quantize(Decimal("0.01"))
            for lt, rate in item_gst_records if rate > 0
        )

        from warehouse.models import SystemSettings
        sys_settings = SystemSettings.load()
        # Split GST: CGST+SGST (intra-state) or IGST (inter-state)
        buyer_state = (buyer.state or "").strip().lower()
        company_state = (sys_settings.company_state or "").strip().lower()
        is_intra = bool(buyer_state and company_state and buyer_state == company_state)
        if tax_amount > 0 and is_intra:
            cgst = (tax_amount / 2).quantize(Decimal("0.01"))
            sgst = tax_amount - cgst
            igst = Decimal("0.00")
        elif tax_amount > 0:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = tax_amount
        else:
            cgst = sgst = igst = Decimal("0.00")

        taxable = subtotal - discount_amt
        total = taxable + tax_amount
        if payment_mode.upper() == SalesOrder.PaymentMode.PAID:
            amount_paid_dec = total
        elif payment_mode.upper() == SalesOrder.PaymentMode.PARTIAL:
            amount_paid_dec = min(Decimal(str(amount_paid or 0)), total)
        else:
            amount_paid_dec = Decimal("0.00")
        amount_paid = amount_paid_dec
        so.subtotal = subtotal
        so.discount = discount_amt
        so.tax_amount = tax_amount
        so.cgst_amount = cgst
        so.sgst_amount = sgst
        so.igst_amount = igst
        so.total_amount = total
        so.amount_paid = amount_paid
        so.amount_due = total - amount_paid
        so.save(update_fields=["subtotal", "discount", "tax_amount", "cgst_amount", "sgst_amount", "igst_amount", "total_amount", "amount_paid", "amount_due"])

        if payment_mode.upper() in (SalesOrder.PaymentMode.CREDIT, SalesOrder.PaymentMode.PARTIAL):
            new_due = total - amount_paid
            if buyer.credit_limit and buyer.credit_limit > 0:
                existing_due = CreditTransaction.objects.filter(buyer=buyer).aggregate(t=Sum("amount_due"))["t"] or Decimal("0")
                if existing_due + new_due > Decimal(str(buyer.credit_limit)):
                    raise GraphQLError(
                        f"Order exceeds {buyer.name}'s credit limit of ₹{buyer.credit_limit}. "
                        f"Current outstanding: ₹{existing_due}, new due: ₹{new_due}."
                    )
            CreditTransaction.objects.create(
                sales_order=so,
                buyer=buyer,
                total_amount=total,
                amount_paid=amount_paid,
                amount_due=total - amount_paid,
            )

    # WhatsApp order confirmation to buyer (fires after the transaction commits)
    if sys_settings.wa_enabled:
        buyer_phone = buyer.whatsapp or buyer.phone
        if buyer_phone:
            from warehouse.tasks import send_whatsapp_order_notification
            currency = sys_settings.currency_symbol
            msg = (
                f"Hello {buyer.name},\n"
                f"Your order *{so.order_number}* has been received at *{sys_settings.company_name}*.\n"
                f"Total: *{currency}{float(so.total_amount):.2f}*"
                + (f" (paid: {currency}{float(so.amount_paid):.2f})" if so.amount_paid > 0 else "")
                + f"\nThank you for your order!"
            )
            send_whatsapp_order_notification.delay(buyer_phone, msg)

    return so


# Once an order is finished it must not be reopened: going back to REQUESTED and
# forward again re-ran the dispatch notification and, worse, made the stock
# restored by a cancellation issuable a second time.
_SO_TERMINAL = {SalesOrder.Status.DELIVERED, SalesOrder.Status.CANCELLED}


def update_sales_order_status(*, user, id, status, actual_delivery=None):
    status = status.upper()
    if status not in SalesOrder.Status.values:
        raise GraphQLError("Invalid status.")

    with transaction.atomic():
        so = get_scoped(user, SalesOrder, id, lock=True)

        if so.status == status:
            return so
        if so.status in _SO_TERMINAL:
            raise GraphQLError(
                f"This order is already {so.status.lower()} and cannot be changed."
            )

        # create_sales_order decremented FinishedProduct.quantity; cancelling only
        # flipped the status, so the pieces were written off permanently.
        if status == SalesOrder.Status.CANCELLED:
            from warehouse.models import ProductSet

            # A line sells either a product or a set, so the cancellation has to
            # put the stock back wherever it was taken from.
            for item in so.items.select_related("finished_product", "product_set"):
                if item.product_set_id:
                    ps = ProductSet.objects.select_for_update().get(pk=item.product_set_id)
                    ps.quantity += item.quantity
                    ps.save(update_fields=["quantity", "updated_at"])
                elif item.finished_product_id:
                    fp = FinishedProduct.objects.select_for_update().get(pk=item.finished_product_id)
                    fp.quantity += item.quantity
                    fp.save(update_fields=["quantity", "updated_at"])

        so.status = status
        if actual_delivery:
            so.actual_delivery = actual_delivery
        so.save()

    # WhatsApp notification when order is dispatched
    if status == SalesOrder.Status.DISPATCHED:
        buyer_phone = so.buyer.whatsapp or so.buyer.phone
        if buyer_phone:
            from warehouse.tasks import send_whatsapp_order_notification
            from warehouse.models import SystemSettings
            settings = SystemSettings.load()
            # The lorry receipt is what a buyer quotes when a parcel goes
            # missing, so it belongs in the message rather than only in our books.
            shipment = ""
            if so.lr_number or so.transporter_name:
                parts = [p for p in (so.transporter_name, so.lr_number and f"LR {so.lr_number}",
                                     so.vehicle_number) if p]
                shipment = f"Shipment: {' · '.join(parts)}\n"
            msg = (
                f"Hello {so.buyer.name},\n"
                f"Your order *{so.order_number}* has been dispatched from *{settings.company_name}*.\n"
                f"{shipment}"
                f"Total: {settings.currency_symbol}{so.total_amount:.2f}\n"
                f"Thank you for your business!"
            )
            send_whatsapp_order_notification.delay(buyer_phone, msg)
    return so


def record_credit_payment(*, credit_id, amount, payment_method="CASH", reference="", notes="", user):
    payment_amount = Decimal(str(amount))
    if payment_amount <= 0:
        raise GraphQLError("Payment amount must be greater than zero.")

    from django.utils import timezone
    with transaction.atomic():
        try:
            credit = CreditTransaction.objects.select_for_update().get(pk=credit_id)
        except CreditTransaction.DoesNotExist as exc:
            raise GraphQLError("Credit transaction not found.") from exc
        if credit.status == CreditTransaction.Status.SETTLED:
            raise GraphQLError("This credit has already been fully settled.")
        if payment_amount > credit.amount_due:
            raise GraphQLError(f"Payment ({payment_amount}) exceeds outstanding balance ({credit.amount_due}).")

        CreditPayment.objects.create(
            credit=credit, amount=payment_amount, payment_method=payment_method.upper(),
            reference=reference.strip(), notes=notes.strip(), recorded_by=user,
            payment_date=timezone.now().date(),
        )
        credit.amount_paid += payment_amount
        credit.amount_due -= payment_amount
        if credit.amount_due <= 0:
            credit.status = CreditTransaction.Status.SETTLED
        else:
            credit.status = CreditTransaction.Status.PARTIAL
        credit.save()

        so = credit.sales_order
        so.amount_paid = credit.amount_paid
        so.amount_due = credit.amount_due
        so.save(update_fields=["amount_paid", "amount_due"])

    # WhatsApp payment receipt to buyer
    from warehouse.models import SystemSettings
    sys_settings = SystemSettings.load()
    if sys_settings.wa_enabled:
        buyer_phone = credit.buyer.whatsapp or credit.buyer.phone
        if buyer_phone:
            from warehouse.tasks import send_whatsapp_order_notification
            currency = sys_settings.currency_symbol
            msg = (
                f"Dear {credit.buyer.name},\n"
                f"Payment of *{currency}{float(payment_amount):.2f}* received for order *{credit.sales_order.order_number}*.\n"
            )
            if credit.status == CreditTransaction.Status.SETTLED:
                msg += f"Your account is now fully settled. Thank you!\n— {sys_settings.company_name}"
            else:
                msg += f"Outstanding balance: *{currency}{float(credit.amount_due):.2f}*\n— {sys_settings.company_name}"
            send_whatsapp_order_notification.delay(buyer_phone, msg)

    return credit


# Statuses a shipment can legitimately leave from. An order still being picked
# can be dispatched — the goods are going out either way — but one already gone
# or cancelled cannot.
_SO_DISPATCHABLE = (
    SalesOrder.Status.REQUESTED,
    SalesOrder.Status.PROCESSING,
    SalesOrder.Status.READY,
)


def dispatch_sales_order(
    *, user, id, transporter_name="", lr_number="", vehicle_number="",
    driver_phone="", dispatch_date=None, freight_charges=0,
    dispatch_notes="", dispatch_photos="",
):
    """
    Record how an order physically left the building, and mark it dispatched.

    The lorry receipt number is the only proof the goods were handed to a
    carrier, and it is the first thing anyone asks for when a parcel does not
    arrive. Photos of the loaded parcel and the LR copy sit alongside it, so a
    dispute is settled from the record rather than from memory.

    Marking dispatched and recording the shipment are one action deliberately:
    an order that has left without an LR is exactly the gap this closes.
    """
    from django.utils import timezone

    from warehouse.services.uploads import save_data_urls_csv

    if not str(lr_number or "").strip() and not str(transporter_name or "").strip():
        raise GraphQLError(
            "Record the transporter or the LR number — without one of them there is "
            "nothing to trace the shipment by."
        )

    with transaction.atomic():
        so = get_scoped(user, SalesOrder, id, lock=True)
        if so.status not in _SO_DISPATCHABLE:
            raise GraphQLError(
                f"This order is {so.get_status_display().lower()} and cannot be dispatched."
            )

        freight = Decimal(str(freight_charges or 0))
        if freight < 0:
            raise GraphQLError("Freight charges cannot be negative.")

        so.transporter_name = (transporter_name or "").strip()
        so.lr_number = (lr_number or "").strip()
        so.vehicle_number = (vehicle_number or "").strip().upper()
        so.driver_phone = (driver_phone or "").strip()
        so.dispatch_date = dispatch_date or timezone.now().date()
        so.freight_charges = freight
        so.dispatch_notes = (dispatch_notes or "").strip()
        so.dispatch_photos = save_data_urls_csv(dispatch_photos or "", "dispatch")
        so.save(update_fields=[
            "transporter_name", "lr_number", "vehicle_number", "driver_phone",
            "dispatch_date", "freight_charges", "dispatch_notes", "dispatch_photos",
            "updated_at",
        ])

    # Status change goes through the one path that also notifies the buyer, and
    # it runs after the shipment is saved so the message can quote the LR.
    return update_sales_order_status(user=user, id=id, status=SalesOrder.Status.DISPATCHED)
