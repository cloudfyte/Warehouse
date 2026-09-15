"""Tell old dockets what they already gave back.

Completing a cutting docket returns the cloth the master did not consume. That
return is now settled as a difference against cloth_returned, which is what
makes a finished docket safe to correct. Dockets completed before that field
existed hold zero while their cloth is long since back on the batch, so
correcting one would credit the remainder a second time.

The figure is not guesswork: a completed docket returned exactly what it did
not consume, which is what the arithmetic says it should hold.
"""
from decimal import Decimal

from django.db import migrations


def teach_old_dockets_what_they_returned(apps, schema_editor):
    CuttingAssignment = apps.get_model("warehouse", "CuttingAssignment")

    for docket in CuttingAssignment.objects.filter(status="COMPLETED", cloth_returned=0):
        consumed = (docket.cloth_used or Decimal("0.00")) + (docket.cloth_wasted or Decimal("0.00"))
        leftover = (docket.meters_assigned or Decimal("0.00")) - consumed
        if leftover <= 0:
            continue
        docket.cloth_returned = leftover
        docket.save(update_fields=["cloth_returned"])


def forget_again(apps, schema_editor):
    """Reversing would make every old docket correctable into a double credit
    again, so it deliberately does nothing."""


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0060_backfill_cloth_returned")]
    operations = [migrations.RunPython(teach_old_dockets_what_they_returned, forget_again)]
