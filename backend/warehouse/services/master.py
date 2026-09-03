"""CRUD for master data: ClothCategory, ClothColor, ItemType, WarehouseLocation."""
from graphql import GraphQLError

from warehouse.models import ClothCategory, ClothColor, ItemType, WarehouseLocation


# ── cloth category ────────────────────────────────────────────────────────────

def create_cloth_category(*, name, description=""):
    if ClothCategory.objects.filter(name__iexact=name.strip()).exists():
        raise GraphQLError("A cloth category with this name already exists.")
    return ClothCategory.objects.create(name=name.strip(), description=description.strip())


def update_cloth_category(*, id, name=None, description=None, active=None):
    obj = _get_or_404(ClothCategory, id)
    if name is not None:
        obj.name = name.strip()
    if description is not None:
        obj.description = description.strip()
    if active is not None:
        obj.active = active
    obj.save()
    return obj


# ── cloth color ───────────────────────────────────────────────────────────────

def create_cloth_color(*, name, hex_code="", reuse_existing=False):
    """
    Add a shade to the master list.

    ``reuse_existing`` is for callers whose intent is "make sure this colour
    exists" rather than "add a new one" — someone at the tag printer typing
    "Off White". They are matching against a list that can be a refresh
    behind, so a colour another user just added would otherwise dead-end on a
    duplicate error with no id to fall back to. The Colors screen leaves it
    off, where "that already exists" is the useful answer.
    """
    existing = ClothColor.objects.filter(name__iexact=name.strip()).first()
    if existing:
        if reuse_existing:
            return existing
        raise GraphQLError("A color with this name already exists.")
    return ClothColor.objects.create(name=name.strip(), hex_code=hex_code.strip())


def update_cloth_color(*, id, name=None, hex_code=None, active=None):
    obj = _get_or_404(ClothColor, id)
    if name is not None:
        obj.name = name.strip()
    if hex_code is not None:
        obj.hex_code = hex_code.strip()
    if active is not None:
        obj.active = active
    obj.save()
    return obj


# ── item type ─────────────────────────────────────────────────────────────────

def create_item_type(*, name, category="", cloth_length_per_piece=0, hsn_code="", gst_rate=0):
    if ItemType.objects.filter(name__iexact=name.strip()).exists():
        raise GraphQLError("An item type with this name already exists.")
    return ItemType.objects.create(
        name=name.strip(), category=category.strip(),
        cloth_length_per_piece=cloth_length_per_piece,
        hsn_code=hsn_code.strip(),
        gst_rate=gst_rate,
    )


def update_item_type(*, id, name=None, category=None, cloth_length_per_piece=None, hsn_code=None, gst_rate=None, active=None):
    obj = _get_or_404(ItemType, id)
    if name is not None:
        obj.name = name.strip()
    if category is not None:
        obj.category = category.strip()
    if cloth_length_per_piece is not None:
        obj.cloth_length_per_piece = cloth_length_per_piece
    if hsn_code is not None:
        obj.hsn_code = hsn_code.strip()
    if gst_rate is not None:
        obj.gst_rate = gst_rate
    if active is not None:
        obj.active = active
    obj.save()
    return obj


# ── warehouse location ────────────────────────────────────────────────────────

def create_warehouse(*, name, code, location_type="WAREHOUSE", address="", city="", state="", pincode="", phone=""):
    if WarehouseLocation.objects.filter(code__iexact=code.strip()).exists():
        raise GraphQLError("A location with this code already exists.")
    return WarehouseLocation.objects.create(
        name=name.strip(), code=code.strip().upper(),
        location_type=location_type, address=address.strip(),
        city=city.strip(), state=state.strip(), pincode=pincode.strip(),
        phone=phone.strip(),
    )


def update_warehouse(*, id, name=None, location_type=None, address=None, city=None, state=None, pincode=None, phone=None, active=None):
    obj = _get_or_404(WarehouseLocation, id)
    _set_fields(obj, name=name, location_type=location_type, address=address,
                city=city, state=state, pincode=pincode, phone=phone, active=active)
    obj.save()
    return obj


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(model, pk):
    try:
        return model.objects.get(pk=pk)
    except model.DoesNotExist as exc:
        raise GraphQLError(f"{model.__name__} not found.") from exc


def _set_fields(obj, **kwargs):
    for field, value in kwargs.items():
        if value is not None:
            setattr(obj, field, value.strip() if isinstance(value, str) else value)
