from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType, RawClothBatch, ReadymadeStock, Supplier,
)
from warehouse.permissions import get_warehouse


def create_raw_cloth_batch(*, user, supplier_id, category_id, color_id, warehouse_id,
                           total_meters, cost_per_meter=0, bin_location="", notes="", received_date=None):
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
            **({"received_date": received_date} if received_date else {}),
        )
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
