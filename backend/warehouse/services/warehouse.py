from graphql import GraphQLError

from warehouse.models import WarehouseLocation


def create_warehouse(*, name, code, address="", city="", state="", pincode=""):
    if WarehouseLocation.objects.filter(code__iexact=code.strip()).exists():
        raise GraphQLError("A warehouse with this code already exists.")
    return WarehouseLocation.objects.create(
        name=name.strip(),
        code=code.strip().upper(),
        address=address.strip(),
        city=city.strip(),
        state=state.strip(),
        pincode=pincode.strip(),
    )


def update_warehouse(*, id, **kwargs):
    try:
        wh = WarehouseLocation.objects.get(pk=id)
    except WarehouseLocation.DoesNotExist as exc:
        raise GraphQLError("Warehouse not found.") from exc
    for field, value in kwargs.items():
        if value is not None:
            setattr(wh, field, value.strip() if isinstance(value, str) else value)
    wh.save()
    return wh
