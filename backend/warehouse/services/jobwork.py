"""Whole jobs given to an outside handler.

The in-house path is cloth into the godown, an employed cutting master, then a
karigar. This is the other one: the supplier ships cloth straight to a unit in
another city that cuts and stitches it and sends garments back. The cloth never
touches a godown, so there is no batch to cut and no docket to write.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, JobworkOrder, JobworkSize, Karigar, Supplier,
)
from warehouse.permissions import get_warehouse, require_role
from warehouse.services.uploads import save_data_urls_csv

_MANAGE = (EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
           EmployeeProfile.Role.STORE_KEEPER)


def _size_rows(sizes, field="pieces"):
    rows = [r for r in (sizes or []) if (r.get("size") or "").strip()]
    for row in rows:
        if int(row.get(field) or 0) < 0:
            raise GraphQLError(f"Size {row['size']} cannot be a negative count.")
    if len({(r["size"] or "").strip().lower() for r in rows}) != len(rows):
        raise GraphQLError("The same size is listed twice.")
    return rows


def create_jobwork_order(*, user, karigar_id, item_type_id, receive_warehouse_id,
                         sizes, supplier_id=None, design_number="", cloth_meters=0,
                         cloth_cost=0, rate_per_piece=None, job_type=None,
                         customer_bill_number="", customer_name="", customer_phone="",
                         bill_photos="", due_date=None, notes="", **transit):
    require_role(user, *_MANAGE)
    warehouse = get_warehouse(user, receive_warehouse_id)

    try:
        karigar = Karigar.objects.get(pk=karigar_id, active=True)
    except Karigar.DoesNotExist as exc:
        raise GraphQLError("Karigar not found or inactive.") from exc

    rows = _size_rows(sizes)
    if not rows or sum(int(r["pieces"]) for r in rows) <= 0:
        raise GraphQLError("How many pieces of each size are you expecting back?")

    job_type = (job_type or JobworkOrder.JobType.WHOLESALE).upper()
    if job_type not in JobworkOrder.JobType.values:
        raise GraphQLError("An outside job is either wholesale or readymade.")
    if job_type == JobworkOrder.JobType.READYMADE and not (customer_bill_number or "").strip():
        raise GraphQLError(
            "Readymade work is made against a customer's bill — give the bill number."
        )
    customer_order = None
    if job_type == JobworkOrder.JobType.READYMADE:
        from warehouse.services.customer_order import claim_customer_order

        customer_order = claim_customer_order(
            user=user, bill_number=customer_bill_number,
            customer_name=customer_name, customer_phone=customer_phone,
            bill_photos=bill_photos)
    else:
        customer_bill_number = ""

    # Frozen at the moment the job is placed, like any other handed-out work.
    rate = Decimal(str(rate_per_piece if rate_per_piece is not None else karigar.rate_per_piece))
    if rate < 0:
        raise GraphQLError("A rate cannot be negative.")

    supplier = None
    if supplier_id:
        try:
            supplier = Supplier.objects.get(pk=supplier_id)
        except Supplier.DoesNotExist as exc:
            raise GraphQLError("Supplier not found.") from exc

    with transaction.atomic():
        order = JobworkOrder.objects.create(
            karigar=karigar, supplier=supplier, item_type_id=item_type_id,
            receive_warehouse=warehouse,
            design_number=(design_number or "").strip(),
            cloth_meters=Decimal(str(cloth_meters or 0)),
            cloth_cost=Decimal(str(cloth_cost or 0)),
            job_type=job_type, customer_bill_number=(customer_bill_number or "").strip(),
            customer_order=customer_order,
            rate_per_piece=rate, due_date=due_date, notes=(notes or "").strip(),
            created_by=user,
            sent_transporter=(transit.get("sent_transporter") or "").strip(),
            sent_lr_number=(transit.get("sent_lr_number") or "").strip(),
            sent_vehicle_number=(transit.get("sent_vehicle_number") or "").strip(),
            sent_photos=save_data_urls_csv(transit.get("sent_photos") or "", "jobwork"),
        )
        JobworkSize.objects.bulk_create([
            JobworkSize(order=order, size=r["size"].strip(),
                        pieces_expected=int(r["pieces"]), sort_order=i)
            for i, r in enumerate(rows)
        ])
    return order


def open_jobwork_from_purchase(*, user, bill_item, item, warehouse):
    """Open the outside job that this purchase line already is.

    The cloth was bought and railed straight on to the unit; the supplier, the
    metres and what they cost are on the bill line and are not asked for
    again. Sizes are usually not known yet — they come back with the garments.
    """
    if not item.get("item_type_id"):
        raise GraphQLError(
            "Cloth going straight to a stitching unit — what garment are they making?")
    try:
        karigar = Karigar.objects.get(pk=item["deliver_to_karigar_id"], active=True)
    except Karigar.DoesNotExist as exc:
        raise GraphQLError("Karigar not found or inactive.") from exc

    job_type = (item.get("job_type") or JobworkOrder.JobType.WHOLESALE).upper()
    if job_type not in JobworkOrder.JobType.values:
        raise GraphQLError("An outside job is either wholesale or readymade.")
    customer_order = None
    bill_number = (item.get("customer_bill_number") or "").strip()
    if job_type == JobworkOrder.JobType.READYMADE:
        if not bill_number:
            raise GraphQLError(
                "Readymade work is made against a customer's bill — give the bill number.")
        from warehouse.services.customer_order import claim_customer_order

        customer_order = claim_customer_order(
            user=user, bill_number=bill_number,
            customer_name=item.get("customer_name", ""),
            customer_phone=item.get("customer_phone", ""),
            bill_photos=item.get("bill_photos", ""))
    else:
        bill_number = ""

    rate = item.get("rate_per_piece")
    rate = Decimal(str(rate if rate not in (None, "") else karigar.rate_per_piece))
    if rate < 0:
        raise GraphQLError("A rate cannot be negative.")

    order = JobworkOrder.objects.create(
        karigar=karigar,
        purchase_bill_item=bill_item,
        supplier=bill_item.bill.supplier,
        item_type_id=item["item_type_id"],
        receive_warehouse=warehouse,
        design_number=(item.get("design_number") or "").strip(),
        cloth_meters=Decimal(str(item.get("total_meters") or 0)),
        cloth_cost=bill_item.total_price or Decimal("0.00"),
        job_type=job_type,
        customer_bill_number=bill_number,
        customer_order=customer_order,
        rate_per_piece=rate,
        due_date=item.get("due_date"),
        notes=(item.get("notes") or "").strip(),
        created_by=user,
        sent_transporter=(item.get("sent_transporter") or "").strip(),
        sent_lr_number=(item.get("sent_lr_number") or "").strip(),
        sent_vehicle_number=(item.get("sent_vehicle_number") or "").strip(),
        sent_photos=save_data_urls_csv(item.get("sent_photos") or "", "jobwork"),
    )
    rows = _size_rows(item.get("sizes"))
    if rows:
        JobworkSize.objects.bulk_create([
            JobworkSize(order=order, size=r["size"].strip(),
                        pieces_expected=int(r["pieces"]), sort_order=i)
            for i, r in enumerate(rows)
        ])
    return order


def receive_jobwork(*, user, id, sizes, received_date=None, sale_price=None, **transit):
    """
    Book the garments that came back.

    Counted by size, because that is how they were ordered and how they will be
    tagged. What comes back is what the unit is paid for — a short delivery is
    a short delivery, not a discount to argue about later.
    """
    require_role(user, *_MANAGE)

    with transaction.atomic():
        try:
            order = JobworkOrder.objects.select_for_update().get(pk=id)
        except JobworkOrder.DoesNotExist as exc:
            raise GraphQLError("Outside job not found.") from exc
        if order.status == JobworkOrder.Status.CANCELLED:
            raise GraphQLError(f"{order.order_number} was cancelled.")

        by_size = {s.size.lower(): s for s in order.sizes.all()}
        for row in _size_rows(sizes, field="received"):
            found = by_size.get(row["size"].strip().lower())
            if not found and not by_size:
                # Opened from a purchase, where nobody knew the size split yet.
                found = JobworkSize.objects.create(
                    order=order, size=row["size"].strip(),
                    pieces_expected=int(row.get("received") or 0),
                    sort_order=order.sizes.count())
            elif not found:
                raise GraphQLError(f"Size {row['size']} was not on this order.")
            received = int(row.get("received") or 0)
            if received > found.pieces_expected:
                raise GraphQLError(
                    f"{received} of size {found.size} came back, but only "
                    f"{found.pieces_expected} were sent out. Raise the order if the "
                    f"unit made more."
                )
            found.pieces_received = received
            found.save(update_fields=["pieces_received"])

        for field in ("return_transporter", "return_lr_number", "return_vehicle_number"):
            if transit.get(field) is not None:
                setattr(order, field, transit[field].strip())
        if transit.get("return_photos") is not None:
            order.return_photos = save_data_urls_csv(transit["return_photos"], "jobwork")

        total = sum(s.pieces_received for s in order.sizes.all())
        expected = sum(s.pieces_expected for s in order.sizes.all())
        order.status = (JobworkOrder.Status.RECEIVED if total >= expected
                        else JobworkOrder.Status.PARTIAL)
        order.received_date = received_date or timezone.now().date()
        order.save()

        # What a piece actually cost us: the cloth we paid for plus what the
        # unit charged to turn it into a garment. Known exactly here and
        # nowhere else, so it is worked out now rather than guessed later.
        if sale_price is not None and total:
            from warehouse.services.production import create_finished_products

            making = (order.rate_per_piece or Decimal("0.00")) * total
            cost_each = ((order.cloth_cost or Decimal("0.00")) + making) / total
            for row in order.sizes.all():
                if row.pieces_received <= 0:
                    continue
                create_finished_products(
                    user=user,
                    item_type_id=order.item_type_id,
                    warehouse_id=order.receive_warehouse_id,
                    size=row.size,
                    quantity=row.pieces_received,
                    cost_price=cost_each,
                    sale_price=sale_price,
                    customer_bill_number=order.customer_bill_number,
                    customer_order=order.customer_order,
                )
    return order


def pay_jobwork(*, user, id, amount):
    """The unit is paid for what it actually sent back."""
    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
    amount = Decimal(str(amount or 0))
    if amount <= 0:
        raise GraphQLError("A payment has to be more than zero.")

    with transaction.atomic():
        try:
            order = JobworkOrder.objects.select_for_update().get(pk=id)
        except JobworkOrder.DoesNotExist as exc:
            raise GraphQLError("Outside job not found.") from exc
        if amount > order.amount_due:
            raise GraphQLError(
                f"{order.order_number} has {order.amount_due} outstanding "
                f"({order.amount_earned} earned on {order.pieces_received} pieces received)."
            )
        order.amount_paid = (order.amount_paid or Decimal("0.00")) + amount
        order.save(update_fields=["amount_paid", "updated_at"])
    return order
