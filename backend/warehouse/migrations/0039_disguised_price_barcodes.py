"""Disguise the price inside the barcode, and move to a 2 + price + 1 shape.

The code buried the cost as a plain number, which anyone who worked out the
trick could read straight off the tag. It now buries the cost multiplied by a
factor kept in settings, so the figure does not look like a price and the staff
who know the multiplier can still divide back to the discount floor.

The shape becomes two random digits, the disguised figure, one random digit.
Saved settings are moved onto that shape, since a warehouse configured with the
old three-and-three would otherwise keep printing it.

Codes retired along the way are kept, so tags already on the rack keep scanning.
"""
import secrets
from decimal import Decimal

from django.db import migrations

PREFIX = 2
SUFFIX = 1
MULTIPLIER = Decimal("2.1")


def _encoded(price, multiplier):
    return int(round(Decimal(str(price or 0)) * Decimal(str(multiplier))))


def _code(price, prefix, suffix, multiplier):
    def digits(n):
        return "".join(str(secrets.randbelow(10)) for _ in range(n))
    return f"{digits(prefix)}{_encoded(price, multiplier)}{digits(suffix)}"


def forwards(apps, schema_editor):
    SystemSettings = apps.get_model("warehouse", "SystemSettings")
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")

    settings = SystemSettings.objects.first()
    if settings is not None:
        settings.barcode_prefix_digits = PREFIX
        settings.barcode_suffix_digits = SUFFIX
        settings.barcode_price_multiplier = MULTIPLIER
        settings.save(update_fields=[
            "barcode_prefix_digits", "barcode_suffix_digits", "barcode_price_multiplier",
        ])
        source = (getattr(settings, "barcode_price_source", "COST") or "COST").upper()
    else:
        source = "COST"

    try:
        from warehouse.services.barcode import generate_barcode_svg
    except Exception:  # pragma: no cover
        generate_barcode_svg = None

    taken = set(FinishedProduct.objects.values_list("barcode", flat=True))
    for product in FinishedProduct.objects.all().iterator():
        price = product.cost_price if source == "COST" else product.sale_price
        wanted = str(_encoded(price, MULTIPLIER))

        buried = product.barcode[PREFIX:len(product.barcode) - SUFFIX] if product.barcode else ""
        if product.barcode and product.barcode.isdigit() and buried == wanted:
            continue

        for _ in range(50):
            code = _code(price, PREFIX, SUFFIX, MULTIPLIER)
            if code not in taken:
                break
        else:
            continue

        taken.discard(product.barcode)
        taken.add(code)

        retired = [c for c in [product.barcode, *(product.previous_barcodes or "").split(",")] if c]
        product.previous_barcodes = ",".join(dict.fromkeys(retired))
        product.barcode = code
        if generate_barcode_svg is not None:
            try:
                product.barcode_svg = generate_barcode_svg(code)
            except Exception:
                product.barcode_svg = ""
        product.tags_printed = False
        product.save(update_fields=[
            "barcode", "previous_barcodes", "barcode_svg", "tags_printed", "updated_at",
        ])


def backwards(apps, schema_editor):
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")
    for product in FinishedProduct.objects.exclude(previous_barcodes="").iterator():
        codes = [c for c in product.previous_barcodes.split(",") if c]
        if not codes:
            continue
        product.barcode = codes[0]
        product.previous_barcodes = ",".join(codes[1:])
        product.save(update_fields=["barcode", "previous_barcodes"])


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0038_systemsettings_barcode_price_multiplier_and_more")]
    operations = [migrations.RunPython(forwards, backwards)]
