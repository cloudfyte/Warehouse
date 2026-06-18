from graphql import GraphQLError

from warehouse.models import Vendor


def create_vendor(*, name, contact_person="", email="", phone="", address="", gstin=""):
    return Vendor.objects.create(
        name=name.strip(),
        contact_person=contact_person.strip(),
        email=email.strip(),
        phone=phone.strip(),
        address=address.strip(),
        gstin=gstin.strip().upper(),
    )


def update_vendor(*, id, **kwargs):
    try:
        vendor = Vendor.objects.get(pk=id)
    except Vendor.DoesNotExist as exc:
        raise GraphQLError("Vendor not found.") from exc
    for field, value in kwargs.items():
        if value is not None:
            if field == "gstin":
                value = value.strip().upper()
            elif isinstance(value, str):
                value = value.strip()
            setattr(vendor, field, value)
    vendor.save()
    return vendor
