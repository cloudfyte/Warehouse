"""Say which design numbers nobody typed.

A design number is the warehouse user\x27s to enter — it is the mill\x27s number for
the cloth, and no one else can invent it. Batches recorded before the field
existed had nothing to put there, and migration 0051 filled the column with
their batch number so the uniqueness rule could hold.

Those are placeholders, not design numbers, and a placeholder that looks like
data is worse than an empty box. Flagged here so the floor can see which
batches are still waiting for their real number.
"""
from django.db import migrations


def flag_the_ones_nobody_typed(apps, schema_editor):
    RawClothBatch = apps.get_model("warehouse", "RawClothBatch")

    for batch in RawClothBatch.objects.all():
        if batch.design_number and batch.design_number == batch.batch_number:
            batch.design_number_provisional = True
            batch.save(update_fields=["design_number_provisional"])


def unflag(apps, schema_editor):
    RawClothBatch = apps.get_model("warehouse", "RawClothBatch")
    RawClothBatch.objects.update(design_number_provisional=False)


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0064_mark_invented_design_numbers")]
    operations = [migrations.RunPython(flag_the_ones_nobody_typed, unflag)]
