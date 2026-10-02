"""The arrival carries its own condition.

An inspection record, one per order, cannot describe three lorries turning up on
three days, and it asked somebody to write the same arrival down twice. What was
found when the parcel was opened belongs to the arrival that was opened.
"""
from django.db import migrations, models


def inspections_become_part_of_the_arrival(apps, schema_editor):
    ParcelInspection = apps.get_model("warehouse", "ParcelInspection")
    GoodsReceipt = apps.get_model("warehouse", "GoodsReceipt")

    for ins in ParcelInspection.objects.all().select_related("purchase_order"):
        receipt = (GoodsReceipt.objects
                   .filter(purchase_order_id=ins.purchase_order_id)
                   .order_by("received_at").first())
        if receipt is None:
            # Inspected but never booked in — the inspection is the only record
            # that anybody stood at the bay, so it becomes the arrival.
            receipt = GoodsReceipt(purchase_order_id=ins.purchase_order_id,
                                   received_by_id=ins.inspected_by_id)
        receipt.parcel_condition = ins.parcel_condition
        receipt.quantity_check_passed = ins.quantity_check_passed
        receipt.discrepancy_notes = ins.discrepancy_notes
        receipt.photos = ins.photos
        if ins.notes:
            receipt.notes = f"{receipt.notes}\n{ins.notes}".strip() if receipt.notes else ins.notes
        receipt.save()


class Migration(migrations.Migration):

    dependencies = [
        ('warehouse', '0072_the_stitcher_is_the_karigar'),
    ]

    operations = [
        migrations.AddField(
            model_name='goodsreceipt',
            name='discrepancy_notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='goodsreceipt',
            name='parcel_condition',
            field=models.CharField(choices=[('GOOD', 'Good condition'), ('PARTIAL_DAMAGE', 'Partly damaged'), ('DAMAGED', 'Damaged')], default='GOOD', max_length=20),
        ),
        migrations.AddField(
            model_name='goodsreceipt',
            name='photos',
            field=models.TextField(blank=True, help_text='Comma-separated photos of the parcel'),
        ),
        migrations.AddField(
            model_name='goodsreceipt',
            name='quantity_check_passed',
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(inspections_become_part_of_the_arrival,
                             migrations.RunPython.noop),
        migrations.DeleteModel(
            name='ParcelInspection',
        ),
    ]
