"""Move product barcodes to digits only.

The price-carrying code shipped as two letters, the price, two letters. Digits
scan on the cheapest hardware and the letters bought nothing, so the shape is
now random digits, the price, random digits — 204 3000 123 — with the count of
random digits either side configurable.

Anything not already all-digits is re-minted. Retired codes are kept, so tags
already sewn onto garments keep scanning, and each product is flagged for
reprinting.
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

    try:
        from warehouse.services.barcode import generate_barcode_svg
    except Exception:  # pragma: no cover - never block a deploy on this
        generate_barcode_svg = None

    taken = set(FinishedProduct.objects.values_list("barcode", flat=True))
    for product in FinishedProduct.objects.all().iterator():
        # Already digits-only means already the current scheme, so a re-run and
        # a second deploy leave the rack alone.
        if product.barcode and product.barcode.isdigit():
            continue

        for _ in range(50):
            code = _numeric_code(product.sale_price, prefix, suffix)
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
    dependencies = [("warehouse", "0034_systemsettings_barcode_prefix_digits_and_more")]
    operations = [migrations.RunPython(forwards, backwards)]
