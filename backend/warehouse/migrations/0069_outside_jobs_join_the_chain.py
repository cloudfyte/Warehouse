"""Outside jobs join the chain they were always part of.

JobworkOrder was StitchingJob with the field names changed: a karigar, a rate
per piece, sizes, two transit legs, garments at the end. Having it apart meant a
second menu for the same step, a second screen to look at, and production
figures that quietly missed every piece made outside. The rows move onto
StitchingJob, keeping their JW- numbers so people still recognise them.
"""
from django.db import migrations

STATUS = {
    "SENT": "PROCESSING",
    "PARTIAL": "PROCESSING",
    "RECEIVED": "READY",
    "CANCELLED": "REJECTED",
}


def move_jobwork_onto_stitching(apps, schema_editor):
    JobworkOrder = apps.get_model("warehouse", "JobworkOrder")
    StitchingJob = apps.get_model("warehouse", "StitchingJob")
    StitchingSize = apps.get_model("warehouse", "StitchingSize")
    FinishedProduct = apps.get_model("warehouse", "FinishedProduct")

    for order in JobworkOrder.objects.all().prefetch_related("sizes"):
        if StitchingJob.objects.filter(job_number=order.order_number).exists():
            continue  # already moved
        sizes = list(order.sizes.all())
        job = StitchingJob.objects.create(
            job_number=order.order_number,
            cutting_assignment=None,
            purchase_bill_item_id=order.purchase_bill_item_id,
            item_type_id=order.item_type_id,
            design_number=order.design_number or "",
            karigar_id=order.karigar_id,
            rate_per_piece=order.rate_per_piece,
            amount_paid=order.amount_paid,
            job_type=order.job_type,
            customer_bill_number=order.customer_bill_number,
            customer_order_id=order.customer_order_id,
            tailor=None,
            pieces_assigned=sum(s.pieces_expected for s in sizes),
            pieces_completed=sum(s.pieces_received for s in sizes),
            pieces_rejected=0,
            status=STATUS.get(order.status, "PROCESSING"),
            assigned_date=order.sent_date,
            due_date=order.due_date,
            completed_date=order.received_date,
            notes=order.notes,
            issue_transporter=order.sent_transporter,
            issue_lr_number=order.sent_lr_number,
            issue_vehicle_number=order.sent_vehicle_number,
            issue_date=order.sent_date,
            issue_photos=order.sent_photos,
            return_transporter=order.return_transporter,
            return_lr_number=order.return_lr_number,
            return_vehicle_number=order.return_vehicle_number,
            return_date=order.received_date,
            return_photos=order.return_photos,
            return_warehouse_id=order.receive_warehouse_id,
            assigned_by_id=order.created_by_id,
            created_at=order.created_at,
        )
        StitchingSize.objects.bulk_create([
            StitchingSize(job=job, size=s.size, pieces_assigned=s.pieces_expected,
                          pieces_completed=s.pieces_received, sort_order=s.sort_order)
            for s in sizes
        ])
        # Garments booked in from an outside job had no job at all, because the
        # finished-goods row only ever pointed at a StitchingJob.
        if order.customer_bill_number:
            FinishedProduct.objects.filter(
                customer_bill_number=order.customer_bill_number,
                stitching_job__isnull=True,
            ).update(stitching_job=job)


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0068_stitching_job_covers_outside_work")]
    operations = [
        migrations.RunPython(move_jobwork_onto_stitching, migrations.RunPython.noop),
    ]
