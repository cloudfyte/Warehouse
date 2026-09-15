"""Written bills for garments made to a customer's measure.

Somebody is measured in the retail shop and leaves with a handwritten bill. The
garment is made here, and everything downstream has to say whose it is — so the
bill is one record rather than a number copied onto each step.
"""
from django.db import transaction
from graphql import GraphQLError

from warehouse.models import CustomerOrder, EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.uploads import save_data_urls_csv

_MANAGE = (EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
           EmployeeProfile.Role.STORE_KEEPER)


def claim_customer_order(*, user, bill_number, customer_name="", customer_phone="",
                         bill_photos="", notes=""):
    """
    Find the bill, or start it.

    The same bill reaches the cutting docket and then the karigar's job, so
    naming it twice must not make two of it. Details given later fill in blanks
    rather than overwrite — the photograph of the paper usually arrives after
    somebody has already typed the number.
    """
    number = (bill_number or "").strip()
    if not number:
        raise GraphQLError("A made-to-measure job needs the customer's bill number.")

    with transaction.atomic():
        order, created = CustomerOrder.objects.select_for_update().get_or_create(
            bill_number=number, defaults={"created_by": user})

        changed = []
        if customer_name and not order.customer_name:
            order.customer_name = customer_name.strip(); changed.append("customer_name")
        if customer_phone and not order.customer_phone:
            order.customer_phone = customer_phone.strip(); changed.append("customer_phone")
        if notes and not order.notes:
            order.notes = notes.strip(); changed.append("notes")
        if bill_photos:
            # Photos add up rather than replace: the bill may be two pages, and
            # they are rarely photographed in one go.
            existing = [p for p in (order.bill_photos or "").split(",") if p]
            fresh = [p for p in save_data_urls_csv(bill_photos, "customer-bills").split(",") if p]
            merged = list(dict.fromkeys(existing + fresh))
            if merged != existing:
                order.bill_photos = ",".join(merged); changed.append("bill_photos")
        if changed:
            order.save(update_fields=changed + ["updated_at"])
    return order


def update_customer_order(*, user, id, **changes):
    """Correct a bill — a misheard name, a second page photographed later."""
    require_role(user, *_MANAGE)
    try:
        order = CustomerOrder.objects.get(pk=id)
    except CustomerOrder.DoesNotExist as exc:
        raise GraphQLError("Customer bill not found.") from exc

    for field in ("customer_name", "customer_phone", "notes"):
        if changes.get(field) is not None:
            setattr(order, field, changes[field].strip())
    if changes.get("bill_photos") is not None:
        order.bill_photos = save_data_urls_csv(changes["bill_photos"], "customer-bills")
    order.save()
    return order
