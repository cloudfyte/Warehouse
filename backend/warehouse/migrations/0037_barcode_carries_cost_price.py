"""Bury the cost price in the barcode instead of the sale price.

The number inside the code exists so someone at the counter can see the floor
and know how far a discount can go. The sale price is already printed on the
tag in rupees, so encoding it again told nobody anything the customer could not
also read.

Every code whose buried figure is not the current cost is re-minted. Retired
codes are kept, so tags already on the rack keep scanning.
"""
import secrets

from django.db import migrations

DEFAULT_PAD = 3


def _numeric_code(price, prefix, suffix):
    def digits(n):
        return "".join(str(secrets.randbelow(10)) for _ in range(n))
    return f"{digits(prefix)}{int(round(float(price or 0)))}{digits(suffix)}"


def forwards(apps, schema_editor):
    SystemSettings = apps.get_model("warehouse", "SystemSettings")
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")

    settings = SystemSettings.objects.first()
    prefix = getattr(settings, "barcode_prefix_digits", DEFAULT_PAD) or DEFAULT_PAD
    suffix = getattr(settings, "barcode_suffix_digits", DEFAULT_PAD) or DEFAULT_PAD
    source = (getattr(settings, "barcode_price_source", "COST") or "COST").upper()

    try:
        from warehouse.services.barcode import generate_barcode_svg
    except Exception:  # pragma: no cover
        generate_barcode_svg = None

    taken = set(FinishedProduct.objects.values_list("barcode", flat=True))
    for product in FinishedProduct.objects.all().iterator():
        wanted = product.cost_price if source == "COST" else product.sale_price
        wanted_digits = str(int(round(float(wanted or 0))))

        # Already carrying the right figure in the right place: leave the rack
        # alone. This is what makes a re-run and a second deploy free.
        buried = product.barcode[prefix:len(product.barcode) - suffix] if product.barcode else ""
        if product.barcode and product.barcode.isdigit() and buried == wanted_digits:
            continue

        for _ in range(50):
            code = _numeric_code(wanted, prefix, suffix)
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
    dependencies = [("warehouse", "0036_systemsettings_barcode_price_source")]
    operations = [migrations.RunPython(forwards, backwards)]
