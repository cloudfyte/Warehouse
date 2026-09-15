"""Give existing bill numbers a record to hang customer details on.

Readymade work already carried a bill number as loose text on the cutting
docket, the stitching job and the garment. Each of those is now a pointer at
one record, so the numbers already recorded need somewhere to point — otherwise
every job made before today would show a bill with nobody behind it.

Names, phones and the photograph of the paper bill are not recoverable from a
number, so the records start bare and can be filled in as the bills turn up.
"""
from django.db import migrations


def gather_bills_into_records(apps, schema_editor):
    CustomerOrder = apps.get_model("warehouse", "CustomerOrder")
    models = [
        apps.get_model("warehouse", name)
        for name in ("CuttingAssignment", "StitchingJob", "FinishedProduct", "JobworkOrder")
    ]

    numbers = set()
    for model in models:
        numbers |= set(
            model.objects.exclude(customer_bill_number="")
            .values_list("customer_bill_number", flat=True)
        )

    by_number = {}
    for number in sorted(n for n in numbers if n):
        order, _ = CustomerOrder.objects.get_or_create(bill_number=number)
        by_number[number] = order

    for model in models:
        for number, order in by_number.items():
            model.objects.filter(customer_bill_number=number, customer_order__isnull=True).update(
                customer_order=order)


def unlink(apps, schema_editor):
    """The numbers stay on the rows, so nothing is lost by dropping the links."""
    for name in ("CuttingAssignment", "StitchingJob", "FinishedProduct", "JobworkOrder"):
        apps.get_model("warehouse", name).objects.update(customer_order=None)


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0062_customer_order")]
    operations = [migrations.RunPython(gather_bills_into_records, unlink)]
