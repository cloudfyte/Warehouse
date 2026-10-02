"""One shelf for garments.

Bought-in garments lived in a table of their own and had to be "converted"
before they could be tagged or sold — two shelves for one pile of clothes, two
menus to look at them, and a step that existed only because there were two
tables. They are garments: they go where the stitched ones go, marked as bought
in rather than made.
"""
from decimal import Decimal

from django.db import migrations


def _next_sku(FinishedProduct, counter):
    """FP-YYYYMM-NNNN, the same shape the model mints."""
    from django.utils import timezone

    prefix = f"FP-{timezone.now():%Y%m}-"
    if counter["n"] is None:
        last = (FinishedProduct.objects.filter(sku__startswith=prefix)
                .order_by("-sku").values_list("sku", flat=True).first())
        counter["n"] = int(last.rsplit("-", 1)[1]) if last else 0
    counter["n"] += 1
    return f"{prefix}{counter['n']:04d}"


def _barcode(FinishedProduct, cost):
    """Random digits, the disguised cost, random digits — as the model does."""
    import secrets

    figure = int(round(Decimal(str(cost or 0)) * Decimal("2.1")))
    for _ in range(60):
        code = f"{secrets.randbelow(100):02d}{figure}{secrets.randbelow(10)}"
        if not FinishedProduct.objects.filter(barcode=code).exists():
            return code
    raise ValueError("Could not mint a unique barcode for migrated stock.")


def readymade_stock_becomes_garments(apps, schema_editor):
    ReadymadeStock = apps.get_model("warehouse", "ReadymadeStock")
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")
    SupplierReturn = apps.get_model("warehouse", "SupplierReturn")

    counter = {"n": None}
    moved = {}

    for rs in ReadymadeStock.objects.all().order_by("pk"):
        key = (rs.item_type_id, rs.cloth_category_id, rs.cloth_color_id,
               rs.age_group or "", rs.size or "", rs.warehouse_id)
        qty = rs.quantity_available or 0

        product = moved.get(key)
        if product is None:
            product = (FinishedProduct.objects
                       .filter(source="IMPORTED", item_type_id=rs.item_type_id,
                               cloth_category_id=rs.cloth_category_id,
                               cloth_color_id=rs.cloth_color_id,
                               age_group=rs.age_group or "", size=rs.size or "",
                               warehouse_id=rs.warehouse_id, active=True)
                       .first())
        if product is None:
            product = FinishedProduct(
                sku=_next_sku(FinishedProduct, counter),
                item_type_id=rs.item_type_id,
                cloth_category_id=rs.cloth_category_id,
                cloth_color_id=rs.cloth_color_id,
                age_group=rs.age_group or "",
                size=rs.size or "",
                source="IMPORTED",
                supplier_id=rs.supplier_id,
                quantity=qty,
                warehouse_id=rs.warehouse_id,
                cost_price=rs.cost_price or Decimal("0.00"),
                sale_price=rs.cost_price or Decimal("0.00"),
                notes=rs.notes or "",
                active=True,
            )
            product.barcode = _barcode(FinishedProduct, product.cost_price)
            product.save()
        else:
            # The same goods arriving again are more of the same goods, costed
            # as a weighted average rather than restated.
            had = product.quantity or 0
            value = (product.cost_price or Decimal("0.00")) * had + (rs.cost_price or Decimal("0.00")) * qty
            product.quantity = had + qty
            if product.quantity:
                product.cost_price = (value / product.quantity).quantize(Decimal("0.01"))
            if not product.supplier_id:
                product.supplier_id = rs.supplier_id
            product.save()
        moved[key] = product

        # A return already recorded against this stock still points at the same
        # garments.
        SupplierReturn.objects.filter(readymade_stock_id=rs.pk).update(finished_product=product)


class Migration(migrations.Migration):

    dependencies = [("warehouse", "0074_one_shelf_for_garments")]

    operations = [
        migrations.RunPython(readymade_stock_becomes_garments,
                             migrations.RunPython.noop),
    ]
