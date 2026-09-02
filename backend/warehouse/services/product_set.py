"""Sets of garments — built from pieces, breakable back into them.

Stock lives at two levels: pieces held individually, and pieces held inside a
built set. Every operation here moves pieces between the two and never creates
or destroys any, which is the invariant the tests hold to.
"""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, FinishedProduct, ProductSet, ProductSetItem,
)
from warehouse.permissions import get_scoped, get_warehouse, require_role
from warehouse.services.barcode import generate_barcode_svg

_MANAGE = (EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
           EmployeeProfile.Role.STORE_KEEPER)


def create_product_set(*, user, name, item_type_id, warehouse_id, lines,
                       quantity=0, cost_price=None, sale_price=None, notes=""):
    """
    Define a set and, if a quantity is given, build that many from stock.

    lines = [{finished_product_id, pieces_per_set}]

    Prices default to the sum of the members', which is what a set is worth
    before anyone decides to discount it.
    """
    require_role(user, *_MANAGE)
    warehouse = get_warehouse(user, warehouse_id)

    if not lines:
        raise GraphQLError("A set needs at least one product in it.")

    seen = set()
    resolved = []
    for index, line in enumerate(lines):
        product = get_scoped(user, FinishedProduct, line["finished_product_id"])
        if product.pk in seen:
            raise GraphQLError(f"{product.sku} is listed twice in this set.")
        seen.add(product.pk)
        per_set = int(line.get("pieces_per_set") or 1)
        if per_set < 1:
            raise GraphQLError("Every line needs at least one piece per set.")
        if product.warehouse_id != warehouse.id:
            raise GraphQLError(
                f"{product.sku} is in {product.warehouse.name}, not {warehouse.name}. "
                f"A set can only be built from stock in one place."
            )
        resolved.append((product, per_set, index))

    with transaction.atomic():
        product_set = ProductSet.objects.create(
            name=name.strip(),
            item_type_id=item_type_id,
            warehouse=warehouse,
            quantity=0,
            cost_price=Decimal(str(cost_price)) if cost_price is not None
                       else sum((p.cost_price * n for p, n, _ in resolved), Decimal("0.00")),
            sale_price=Decimal(str(sale_price)) if sale_price is not None
                       else sum((p.sale_price * n for p, n, _ in resolved), Decimal("0.00")),
            notes=(notes or "").strip(),
        )
        product_set.barcode_svg = generate_barcode_svg(product_set.barcode)
        product_set.save(update_fields=["barcode_svg"])

        ProductSetItem.objects.bulk_create([
            ProductSetItem(product_set=product_set, finished_product=product,
                           pieces_per_set=per_set, sort_order=index)
            for product, per_set, index in resolved
        ])

        if quantity:
            build_sets(user=user, id=product_set.pk, count=quantity)
            product_set.refresh_from_db()

    return product_set


def build_sets(*, user, id, count):
    """Assemble sets, taking the pieces out of individual stock."""
    require_role(user, *_MANAGE)
    count = int(count)
    if count < 1:
        raise GraphQLError("Build at least one set.")

    with transaction.atomic():
        product_set = get_scoped(user, ProductSet, id, lock=True)
        lines = list(product_set.items.select_related("finished_product"))
        if not lines:
            raise GraphQLError("This set has no products in it.")

        for line in lines:
            needed = line.pieces_per_set * count
            product = FinishedProduct.objects.select_for_update().get(pk=line.finished_product_id)
            if product.quantity < needed:
                raise GraphQLError(
                    f"Only {product.quantity} of {product.sku} in stock; "
                    f"{needed} needed to build {count} set(s)."
                )
            product.quantity -= needed
            product.save(update_fields=["quantity", "updated_at"])

        product_set.quantity += count
        product_set.save(update_fields=["quantity", "updated_at"])
    return product_set


def break_sets(*, user, id, count):
    """Open sets back up, returning their pieces to individual stock."""
    require_role(user, *_MANAGE)
    count = int(count)
    if count < 1:
        raise GraphQLError("Break at least one set.")

    with transaction.atomic():
        product_set = get_scoped(user, ProductSet, id, lock=True)
        if product_set.quantity < count:
            raise GraphQLError(
                f"Only {product_set.quantity} set(s) in stock; cannot break {count}."
            )

        for line in product_set.items.select_related("finished_product"):
            product = FinishedProduct.objects.select_for_update().get(pk=line.finished_product_id)
            product.quantity += line.pieces_per_set * count
            product.save(update_fields=["quantity", "updated_at"])

        product_set.quantity -= count
        product_set.save(update_fields=["quantity", "updated_at"])
    return product_set


def update_product_set(*, user, id, lines=None, **changes):
    """
    Change a set's details, and the make-up of a set that is not yet built.

    The composition of a set that already exists in stock is deliberately fixed:
    changing what a set contains while sets are assembled would silently restate
    where those pieces went.
    """
    require_role(user, *_MANAGE)

    with transaction.atomic():
        product_set = get_scoped(user, ProductSet, id, lock=True)

        if lines is not None:
            if product_set.quantity:
                raise GraphQLError(
                    f"{product_set.quantity} set(s) are built. Break them before changing "
                    f"what the set contains."
                )
            if not lines:
                raise GraphQLError("A set needs at least one product in it.")
            product_set.items.all().delete()
            for index, line in enumerate(lines):
                product = get_scoped(user, FinishedProduct, line["finished_product_id"])
                per_set = int(line.get("pieces_per_set") or 1)
                if per_set < 1:
                    raise GraphQLError("Every line needs at least one piece per set.")
                ProductSetItem.objects.create(
                    product_set=product_set, finished_product=product,
                    pieces_per_set=per_set, sort_order=index)

        changes = {k: v for k, v in changes.items() if v is not None}
        old_price = product_set.cost_price
        for field in ("name", "notes"):
            if field in changes:
                setattr(product_set, field, str(changes[field]).strip())
        for field in ("cost_price", "sale_price"):
            if field in changes:
                value = Decimal(str(changes[field]))
                if value < 0:
                    raise GraphQLError("Prices cannot be negative.")
                setattr(product_set, field, value)
        if "active" in changes:
            product_set.active = bool(changes["active"])

        # The price is inside the code, so a change to it mints a new one and
        # retires the old — which keeps scanning, like a garment's.
        if product_set.cost_price != old_price:
            retired = [c for c in [product_set.barcode, *product_set.past_codes()] if c]
            product_set.previous_barcodes = ",".join(dict.fromkeys(retired))
            product_set.barcode = product_set.mint_barcode()
            product_set.barcode_svg = generate_barcode_svg(product_set.barcode)
            product_set.tags_printed = False

        product_set.save()
    return product_set
