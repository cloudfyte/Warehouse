"""Make the tag changes real for stock and settings that already exist.

Two changes shipped in code but could not reach anyone already using the app:

* The tag row order moved to brand / no age group / no FP number, but that is
  only the *default*. A warehouse that had ever arranged its tag has a saved
  order, and the saved one wins — so the change was invisible to exactly the
  people who had set their tag up.

* Barcodes started carrying the price, but only for products minted afterwards.
  Every product already in stock kept its old GRM code, which is all of them.

Old codes are retired into previous_barcodes rather than dropped, so tags
already sewn onto garments on the rack keep scanning.
"""
import secrets

from django.db import migrations

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# Rows the shop floor asked to have off the tag, and the one to put on.
DROP_ROWS = {"age-group", "sku"}
ADD_ROW = "brand"


def _price_code(price):
    def pair():
        return "".join(secrets.choice(ALPHABET) for _ in range(2))
    return f"{pair()}{int(round(float(price or 0)))}{pair()}"


def forwards(apps, schema_editor):
    SystemSettings = apps.get_model("warehouse", "SystemSettings")
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")

    # ── tag rows ─────────────────────────────────────────────────────────────
    for settings in SystemSettings.objects.all():
        order = settings.tag_component_order
        if not isinstance(order, list) or not order:
            continue  # empty means the new default already applies
        cleaned = [row for row in order if row not in DROP_ROWS]
        if ADD_ROW not in cleaned:
            cleaned.insert(0, ADD_ROW)
        if cleaned != order:
            settings.tag_component_order = cleaned
            settings.save(update_fields=["tag_component_order"])

    # ── barcodes ─────────────────────────────────────────────────────────────
    try:
        from warehouse.services.barcode import generate_barcode_svg
    except Exception:  # pragma: no cover - keeps a deploy from dying on this
        generate_barcode_svg = None

    taken = set(FinishedProduct.objects.values_list("barcode", flat=True))
    for product in FinishedProduct.objects.all().iterator():
        # A code already in the price shape is left alone, so re-running this is
        # harmless and a second deploy does not churn every tag again.
        if product.barcode and not product.barcode.startswith("GRM"):
            continue

        for _ in range(50):
            code = _price_code(product.sale_price)
            if code not in taken:
                break
        else:
            continue  # could not find a free code; leave this one as it was

        taken.discard(product.barcode)
        taken.add(code)

        retired = [c for c in [product.barcode, *(product.previous_barcodes or "").split(",")] if c]
        product.previous_barcodes = ",".join(dict.fromkeys(retired))
        product.barcode = code
        # The image has to be reissued with the code, or the bars would scan as
        # the old number while the text underneath showed the new one.
        if generate_barcode_svg is not None:
            try:
                product.barcode_svg = generate_barcode_svg(code)
            except Exception:
                product.barcode_svg = ""
        # The tag on the rack no longer matches, so it needs printing again.
        product.tags_printed = False
        product.save(update_fields=[
            "barcode", "previous_barcodes", "barcode_svg", "tags_printed", "updated_at",
        ])


def backwards(apps, schema_editor):
    """Put each product back on the last code it carried."""
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")
    for product in FinishedProduct.objects.exclude(previous_barcodes="").iterator():
        codes = [c for c in product.previous_barcodes.split(",") if c]
        if not codes:
            continue
        product.barcode = codes[0]
        product.previous_barcodes = ",".join(codes[1:])
        product.save(update_fields=["barcode", "previous_barcodes"])


class Migration(migrations.Migration):
    dependencies = [
        ("warehouse", "0032_purchaseorderitem_photos_salesorder_dispatch_date_and_more"),
    ]
    operations = [migrations.RunPython(forwards, backwards)]
