"""Reorder point CRUD — configurable per-item stock thresholds."""
from decimal import Decimal

from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, ItemType, ReorderPoint, WarehouseLocation,
)
from warehouse.permissions import get_warehouse


def create_reorder_point(
    *, user, item_kind, warehouse_id,
    cloth_category_id=None, cloth_color_id=None, threshold_meters=None,
    item_type_id=None, size="", threshold_pieces=None,
):
    warehouse = get_warehouse(user, warehouse_id)
    kind = item_kind.upper()

    if kind == ReorderPoint.ItemKind.RAW_CLOTH:
        if not cloth_category_id or threshold_meters is None:
            raise GraphQLError("cloth_category_id and threshold_meters are required for RAW_CLOTH reorder points.")
        try:
            category = ClothCategory.objects.get(pk=cloth_category_id)
        except ClothCategory.DoesNotExist as exc:
            raise GraphQLError("Cloth category not found.") from exc
        color = None
        if cloth_color_id:
            try:
                color = ClothColor.objects.get(pk=cloth_color_id)
            except ClothColor.DoesNotExist as exc:
                raise GraphQLError("Cloth color not found.") from exc

        rp = ReorderPoint.objects.create(
            item_kind=kind,
            cloth_category=category,
            cloth_color=color,
            threshold_meters=Decimal(str(threshold_meters)),
            warehouse=warehouse,
        )

    elif kind == ReorderPoint.ItemKind.FINISHED:
        if not item_type_id or threshold_pieces is None:
            raise GraphQLError("item_type_id and threshold_pieces are required for FINISHED reorder points.")
        try:
            item_type = ItemType.objects.get(pk=item_type_id)
        except ItemType.DoesNotExist as exc:
            raise GraphQLError("Item type not found.") from exc

        rp = ReorderPoint.objects.create(
            item_kind=kind,
            item_type=item_type,
            size=size.strip(),
            threshold_pieces=int(threshold_pieces),
            warehouse=warehouse,
        )
    else:
        raise GraphQLError("item_kind must be RAW_CLOTH or FINISHED.")

    return rp


def update_reorder_point(*, reorder_point_id, threshold_meters=None, threshold_pieces=None, active=None, size=None):
    try:
        rp = ReorderPoint.objects.get(pk=reorder_point_id)
    except ReorderPoint.DoesNotExist as exc:
        raise GraphQLError("Reorder point not found.") from exc

    fields = []
    if threshold_meters is not None:
        rp.threshold_meters = Decimal(str(threshold_meters))
        fields.append("threshold_meters")
    if threshold_pieces is not None:
        rp.threshold_pieces = int(threshold_pieces)
        fields.append("threshold_pieces")
    if active is not None:
        rp.active = active
        fields.append("active")
    if size is not None:
        rp.size = size.strip()
        fields.append("size")
    if fields:
        rp.save(update_fields=fields)
    return rp


def delete_reorder_point(*, reorder_point_id):
    try:
        rp = ReorderPoint.objects.get(pk=reorder_point_id)
    except ReorderPoint.DoesNotExist as exc:
        raise GraphQLError("Reorder point not found.") from exc
    rp.delete()
    return True
