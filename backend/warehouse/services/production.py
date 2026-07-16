"""Cutting assignments and stitching jobs — the production pipeline."""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import CuttingAssignment, EmployeeProfile, FinishedProduct, ItemType, RawClothBatch, StitchingJob
from warehouse.services.barcode import generate_barcode_svg


def create_cutting_assignment(*, user, raw_cloth_batch_id, cutting_master_id, item_type_id,
                              meters_assigned, target_pieces, size="", assigned_date=None, due_date=None, notes=""):
    meters = Decimal(str(meters_assigned))

    try:
        master = EmployeeProfile.objects.get(pk=cutting_master_id, role=EmployeeProfile.Role.CUTTING_MASTER, active=True)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Cutting master not found or inactive.") from exc
    try:
        item_type = ItemType.objects.get(pk=item_type_id, active=True)
    except ItemType.DoesNotExist as exc:
        raise GraphQLError("Item type not found.") from exc

    with transaction.atomic():
        # select_for_update must run inside an atomic block to prevent double-assignment
        try:
            batch = RawClothBatch.objects.select_for_update().get(pk=raw_cloth_batch_id, active=True)
        except RawClothBatch.DoesNotExist as exc:
            raise GraphQLError("Raw cloth batch not found.") from exc

        if meters > batch.available_meters:
            raise GraphQLError(
                f"Only {batch.available_meters}m available in batch {batch.batch_number}, "
                f"but {meters}m requested."
            )

        batch.available_meters -= meters
        batch.save(update_fields=["available_meters", "updated_at"])

        return CuttingAssignment.objects.create(
            raw_cloth_batch=batch,
            cutting_master=master,
            item_type=item_type,
            meters_assigned=meters,
            target_pieces=target_pieces,
            size=size.strip(),
            assigned_date=assigned_date or timezone.now().date(),
            due_date=due_date,
            notes=notes.strip(),
            assigned_by=user,
        )


def update_cutting_assignment(*, id, status=None, pieces_completed=None, cloth_used=None,
                              cloth_wasted=None, completed_date=None, notes=None):
    try:
        assignment = CuttingAssignment.objects.get(pk=id)
    except CuttingAssignment.DoesNotExist as exc:
        raise GraphQLError("Cutting assignment not found.") from exc

    if status is not None:
        assignment.status = status.upper()
    if pieces_completed is not None:
        assignment.pieces_completed = pieces_completed
    if cloth_used is not None:
        assignment.cloth_used = Decimal(str(cloth_used))
    if cloth_wasted is not None:
        assignment.cloth_wasted = Decimal(str(cloth_wasted))
    if completed_date is not None:
        assignment.completed_date = completed_date
    elif status == CuttingAssignment.Status.COMPLETED and not assignment.completed_date:
        assignment.completed_date = timezone.now().date()
    if notes is not None:
        assignment.notes = notes.strip()
    assignment.save()
    return assignment


def create_stitching_job(*, user, cutting_assignment_id, tailor_id, pieces_assigned,
                         assigned_date=None, due_date=None, notes=""):
    try:
        ca = CuttingAssignment.objects.get(pk=cutting_assignment_id)
    except CuttingAssignment.DoesNotExist as exc:
        raise GraphQLError("Cutting assignment not found.") from exc

    already_assigned = StitchingJob.objects.filter(cutting_assignment=ca).aggregate(
        total=__import__("django.db.models", fromlist=["Sum"]).Sum("pieces_assigned")
    )["total"] or 0
    available = ca.pieces_completed - already_assigned
    if pieces_assigned > available:
        raise GraphQLError(f"Only {available} unassigned pieces available from this cutting assignment.")

    try:
        tailor = EmployeeProfile.objects.get(pk=tailor_id, role=EmployeeProfile.Role.TAILOR, active=True)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Tailor not found or inactive.") from exc

    return StitchingJob.objects.create(
        cutting_assignment=ca,
        tailor=tailor,
        pieces_assigned=pieces_assigned,
        assigned_date=assigned_date or timezone.now().date(),
        due_date=due_date,
        notes=notes.strip(),
        assigned_by=user,
    )


def update_stitching_job(*, id, status=None, pieces_completed=None, pieces_rejected=None,
                         completed_date=None, notes=None):
    try:
        job = StitchingJob.objects.get(pk=id)
    except StitchingJob.DoesNotExist as exc:
        raise GraphQLError("Stitching job not found.") from exc

    if status is not None:
        job.status = status.upper()
    if pieces_completed is not None:
        job.pieces_completed = pieces_completed
    if pieces_rejected is not None:
        job.pieces_rejected = pieces_rejected
    if completed_date is not None:
        job.completed_date = completed_date
    elif status == StitchingJob.Status.READY and not job.completed_date:
        job.completed_date = timezone.now().date()
    if notes is not None:
        job.notes = notes.strip()
    job.save()
    return job


def create_finished_products(*, user, stitching_job_id=None, readymade_stock_id=None,
                              item_type_id, cloth_category_id=None, cloth_color_id=None,
                              size="", quantity, warehouse_id, cost_price, sale_price):
    from warehouse.permissions import get_warehouse
    from warehouse.models import ReadymadeStock

    warehouse = get_warehouse(user, warehouse_id)
    source = FinishedProduct.Source.IN_HOUSE if stitching_job_id else FinishedProduct.Source.IMPORTED

    sj = None
    rs = None

    with transaction.atomic():
        if stitching_job_id:
            try:
                sj = StitchingJob.objects.get(pk=stitching_job_id)
            except StitchingJob.DoesNotExist as exc:
                raise GraphQLError("Stitching job not found.") from exc
            item_type_id = sj.cutting_assignment.item_type_id
            cloth_category_id = sj.cutting_assignment.raw_cloth_batch.cloth_category_id
            cloth_color_id = sj.cutting_assignment.raw_cloth_batch.cloth_color_id

        if readymade_stock_id:
            try:
                rs = ReadymadeStock.objects.select_for_update().get(pk=readymade_stock_id)
            except ReadymadeStock.DoesNotExist as exc:
                raise GraphQLError("Readymade stock not found.") from exc
            if rs.quantity_available < quantity:
                raise GraphQLError(f"Only {rs.quantity_available} units available.")
            rs.quantity_available -= quantity
            rs.save(update_fields=["quantity_available"])
            item_type_id = rs.item_type_id
            cloth_color_id = rs.cloth_color_id

        fp = FinishedProduct.objects.create(
            item_type_id=item_type_id,
            cloth_category_id=cloth_category_id,
            cloth_color_id=cloth_color_id,
            size=size.strip(),
            source=source,
            stitching_job=sj,
            readymade_stock=rs,
            quantity=quantity,
            warehouse=warehouse,
            cost_price=Decimal(str(cost_price)),
            sale_price=Decimal(str(sale_price)),
        )
        fp.barcode_svg = generate_barcode_svg(fp.barcode)
        fp.save(update_fields=["barcode_svg"])
        return fp
