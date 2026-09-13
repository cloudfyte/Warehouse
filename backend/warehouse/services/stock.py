from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType, RawClothBatch, ReadymadeStock, Supplier,
)
from warehouse.permissions import get_warehouse
from warehouse.services.uploads import save_data_urls_csv


def claim_design_number(design_number, warehouse_id, *, exclude_pk=None):
    """
    The cloth's one code, checked before anything is written.

    It is how a finished garment is traced back to the cloth it was cut from,
    so two different cloths sharing one would break that trail silently. The
    check is per warehouse: a transfer puts the same cloth in a second godown,
    and that is still one cloth.
    """
    code = (design_number or "").strip()
    if not code:
        raise GraphQLError("Give this cloth its design number — it is how everything downstream finds it.")

    clash = RawClothBatch.objects.filter(design_number__iexact=code, warehouse_id=warehouse_id)
    if exclude_pk:
        clash = clash.exclude(pk=exclude_pk)
    existing = clash.first()
    if existing:
        raise GraphQLError(
            f"Design number {code} is already used by batch {existing.batch_number} "
            f"in this warehouse. Use a different number, or add the meters to that batch."
        )
    return code


def receive_cloth_into_stock(*, design_number, warehouse_id, meters, cost_per_meter,
                             defaults=None):
    """
    Put meters of a cloth into a warehouse, under its design number.

    If the code is the cloth's identity then the code is the stock row: the
    same cloth arriving again is more of that cloth, not a second one. This is
    not a rare case — a purchase order delivered over two lorries hits it every
    time, and refusing the second drop because its design number was "already
    used" would be nonsense.

    Cost is averaged by weight, so a top-up at a different price moves the
    batch's cost the way it actually moved.
    """
    code = (design_number or "").strip()
    if not code:
        raise GraphQLError("Give this cloth its design number — it is how everything downstream finds it.")

    meters = Decimal(str(meters))
    cost = Decimal(str(cost_per_meter or 0))

    existing = (RawClothBatch.objects
                .select_for_update()
                .filter(design_number__iexact=code, warehouse_id=warehouse_id)
                .first())
    if existing is None:
        return RawClothBatch.objects.create(
            design_number=code, warehouse_id=warehouse_id,
            total_meters=meters, available_meters=meters, cost_per_meter=cost,
            **(defaults or {}),
        ), True

    before = existing.total_meters or Decimal("0")
    if before + meters > 0:
        existing.cost_per_meter = (
            (existing.cost_per_meter * before) + (cost * meters)
        ) / (before + meters)
    existing.total_meters = before + meters
    existing.available_meters = (existing.available_meters or Decimal("0")) + meters
    existing.save(update_fields=["total_meters", "available_meters",
                                 "cost_per_meter", "updated_at"])
    return existing, False


def create_raw_cloth_batch(*, user, supplier_id, category_id, color_id, warehouse_id,
                           total_meters, cost_per_meter=0, bin_location="", notes="",
                           received_date=None, design_number="", cloth_code="", photos=""):
    try:
        supplier = Supplier.objects.get(pk=supplier_id, active=True)
    except Supplier.DoesNotExist as exc:
        raise GraphQLError("Supplier not found.") from exc

    try:
        category = ClothCategory.objects.get(pk=category_id, active=True)
    except ClothCategory.DoesNotExist as exc:
        raise GraphQLError("Cloth category not found.") from exc

    try:
        color = ClothColor.objects.get(pk=color_id, active=True)
    except ClothColor.DoesNotExist as exc:
        raise GraphQLError("Cloth color not found.") from exc

    warehouse = get_warehouse(user, warehouse_id)

    meters = Decimal(str(total_meters))
    if meters <= 0:
        raise GraphQLError("Total meters must be greater than zero.")

    with transaction.atomic():
        batch = RawClothBatch.objects.create(
            supplier=supplier, cloth_category=category, cloth_color=color,
            warehouse=warehouse, total_meters=meters, available_meters=meters,
            cost_per_meter=Decimal(str(cost_per_meter)),
            bin_location=bin_location.strip(), notes=notes.strip(),
            design_number=claim_design_number(design_number, warehouse.id),
            # Typed by hand, never generated. A mill's code is the mill's to
            # choose, and a made-up one is a code nobody else can look up.
            cloth_code=(cloth_code or "").strip(),
            photos=save_data_urls_csv(photos or "", "raw-cloth"),
            **({"received_date": received_date} if received_date else {}),
        )
    return batch


def update_raw_cloth_batch(*, user, id, design_number=None, cloth_code=None,
                           photos=None, bin_location=None, notes=None):
    """
    Correct a batch's paperwork.

    Only the descriptive side. Meters are stock and move through cutting and
    transfers, so they are not editable here — a wrong quantity is a stock
    adjustment, which leaves a trail this would not.
    """
    from warehouse.models import EmployeeProfile
    from warehouse.permissions import get_scoped, require_role

    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
                 EmployeeProfile.Role.STORE_KEEPER)
    batch = get_scoped(user, RawClothBatch, id)

    if design_number is not None:
        batch.design_number = claim_design_number(
            design_number, batch.warehouse_id, exclude_pk=batch.pk)
    if cloth_code is not None:
        batch.cloth_code = cloth_code.strip()
    if bin_location is not None:
        batch.bin_location = bin_location.strip()
    if notes is not None:
        batch.notes = notes.strip()
    if photos is not None:
        batch.photos = save_data_urls_csv(photos, "raw-cloth")
    batch.save()
    return batch


def create_readymade_stock(*, user, supplier_id, item_type_id, warehouse_id,
                           quantity, cost_price=0, category_id=None, color_id=None, size="", notes="", received_date=None):
    try:
        supplier = Supplier.objects.get(pk=supplier_id, active=True)
    except Supplier.DoesNotExist as exc:
        raise GraphQLError("Supplier not found.") from exc

    try:
        item_type = ItemType.objects.get(pk=item_type_id, active=True)
    except ItemType.DoesNotExist as exc:
        raise GraphQLError("Item type not found.") from exc

    warehouse = get_warehouse(user, warehouse_id)

    category = None
    if category_id:
        try:
            category = ClothCategory.objects.get(pk=category_id, active=True)
        except ClothCategory.DoesNotExist as exc:
            raise GraphQLError("Cloth category not found.") from exc

    color = None
    if color_id:
        try:
            color = ClothColor.objects.get(pk=color_id, active=True)
        except ClothColor.DoesNotExist as exc:
            raise GraphQLError("Cloth color not found.") from exc

    qty = int(quantity)
    if qty <= 0:
        raise GraphQLError("Quantity must be greater than zero.")

    with transaction.atomic():
        stock = ReadymadeStock.objects.create(
            supplier=supplier, item_type=item_type,
            cloth_category=category, cloth_color=color,
            warehouse=warehouse, size=size.strip(),
            quantity_received=qty, quantity_available=qty,
            cost_price=Decimal(str(cost_price)),
            notes=notes.strip(),
            **({"received_date": received_date} if received_date else {}),
        )
    return stock
