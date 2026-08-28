"""Cutting assignments and stitching jobs — the production pipeline."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import CuttingAssignment, EmployeeProfile, FinishedProduct, ItemType, RawClothBatch, StitchingJob
from warehouse.services.barcode import generate_barcode_svg
from warehouse.services.notify import notify_managers, notify_user


def create_cutting_assignment(*, user, raw_cloth_batch_id, cutting_master_id, item_type_id,
                              meters_assigned, target_pieces, age_group="", size="", assigned_date=None, due_date=None, notes=""):
    meters = Decimal(str(meters_assigned))
    if meters <= 0:
        raise GraphQLError("Meters assigned must be greater than 0.")

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

        assignment = CuttingAssignment.objects.create(
            raw_cloth_batch=batch,
            cutting_master=master,
            item_type=item_type,
            meters_assigned=meters,
            target_pieces=target_pieces,
            age_group=age_group.strip(),
            size=size.strip(),
            assigned_date=assigned_date or timezone.now().date(),
            due_date=due_date,
            notes=notes.strip(),
            assigned_by=user,
        )
        notify_user(
            user=master.user,
            title=f"New Cutting Job: {assignment.assignment_number}",
            message=f"You have been assigned {target_pieces} pieces of {item_type.name} "
                    f"({meters}m from batch {batch.batch_number}).",
            level="INFO",
            link="cutting",
        )
        return assignment


def update_cutting_assignment(*, id, status=None, pieces_completed=None, cloth_used=None,
                              cloth_wasted=None, completed_date=None, notes=None):
    with transaction.atomic():
        try:
            assignment = CuttingAssignment.objects.select_for_update().get(pk=id)
        except CuttingAssignment.DoesNotExist as exc:
            raise GraphQLError("Cutting assignment not found.") from exc

        prev_status = assignment.status
        # Completion returns leftover cloth to the batch, so re-completing an
        # assignment would return it a second time and invent meters.
        if prev_status == CuttingAssignment.Status.COMPLETED:
            raise GraphQLError(
                f"Assignment {assignment.assignment_number} is already completed and cannot be changed."
            )

        if pieces_completed is not None:
            if pieces_completed > assignment.target_pieces:
                raise GraphQLError(
                    f"Pieces completed ({pieces_completed}) cannot exceed target pieces ({assignment.target_pieces})."
                )
            assignment.pieces_completed = pieces_completed
        if cloth_used is not None:
            cloth_used_dec = Decimal(str(cloth_used))
            if cloth_used_dec < 0:
                raise GraphQLError("Cloth used cannot be negative.")
            assignment.cloth_used = cloth_used_dec
        if cloth_wasted is not None:
            cloth_wasted_dec = Decimal(str(cloth_wasted))
            if cloth_wasted_dec < 0:
                raise GraphQLError("Cloth wasted cannot be negative.")
            assignment.cloth_wasted = cloth_wasted_dec

        # cloth_used and cloth_wasted are disjoint (wastage % is wasted/used), so
        # together they are what the assignment consumed.
        consumed = assignment.cloth_used + assignment.cloth_wasted
        if consumed > assignment.meters_assigned:
            raise GraphQLError(
                f"Cloth used ({assignment.cloth_used}m) plus wasted ({assignment.cloth_wasted}m) "
                f"is {consumed}m, more than the {assignment.meters_assigned}m assigned."
            )

        if status is not None:
            assignment.status = status.upper()
        if completed_date is not None:
            assignment.completed_date = completed_date
        elif status == CuttingAssignment.Status.COMPLETED and not assignment.completed_date:
            assignment.completed_date = timezone.now().date()
        if notes is not None:
            assignment.notes = notes.strip()
        assignment.save()

        # The full meters_assigned left the batch when the job was handed out.
        # Whatever the cutting master did not consume is still good cloth — put
        # it back, otherwise every short job silently destroys the remainder.
        if assignment.status == CuttingAssignment.Status.COMPLETED:
            leftover = assignment.meters_assigned - consumed
            if leftover > 0:
                batch = RawClothBatch.objects.select_for_update().get(
                    pk=assignment.raw_cloth_batch_id)
                batch.available_meters += leftover
                batch.save(update_fields=["available_meters", "updated_at"])

    if status == CuttingAssignment.Status.COMPLETED and prev_status != CuttingAssignment.Status.COMPLETED:
        notify_managers(
            title=f"Cutting Complete: {assignment.assignment_number}",
            message=f"{assignment.cutting_master.user.username} completed {assignment.pieces_completed} pieces "
                    f"of {assignment.item_type.name} (job {assignment.assignment_number}).",
            level="INFO",
            link="cutting",
        )
    return assignment


def create_stitching_job(*, user, cutting_assignment_id, tailor_id, pieces_assigned,
                         assigned_date=None, due_date=None, notes=""):
    if pieces_assigned <= 0:
        raise GraphQLError("Pieces assigned must be greater than zero.")

    try:
        tailor = EmployeeProfile.objects.get(pk=tailor_id, role=EmployeeProfile.Role.TAILOR, active=True)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Tailor not found or inactive.") from exc

    with transaction.atomic():
        # Lock the assignment so two managers cannot each read the same
        # unassigned count and both hand out the last pieces.
        try:
            ca = CuttingAssignment.objects.select_for_update().get(pk=cutting_assignment_id)
        except CuttingAssignment.DoesNotExist as exc:
            raise GraphQLError("Cutting assignment not found.") from exc

        already_assigned = StitchingJob.objects.filter(cutting_assignment=ca).aggregate(
            total=Sum("pieces_assigned")
        )["total"] or 0
        available = ca.pieces_completed - already_assigned
        if pieces_assigned > available:
            raise GraphQLError(f"Only {available} unassigned pieces available from this cutting assignment.")

        job = StitchingJob.objects.create(
            cutting_assignment=ca,
            tailor=tailor,
            pieces_assigned=pieces_assigned,
            assigned_date=assigned_date or timezone.now().date(),
            due_date=due_date,
            notes=notes.strip(),
            assigned_by=user,
        )
    notify_user(
        user=tailor.user,
        title=f"New Stitching Job: {job.job_number}",
        message=f"You have been assigned {pieces_assigned} pieces of "
                f"{ca.item_type.name} for stitching (job {job.job_number}).",
        level="INFO",
        link="stitching",
    )
    return job


def update_stitching_job(*, id, status=None, pieces_completed=None, pieces_rejected=None,
                         completed_date=None, notes=None):
    try:
        job = StitchingJob.objects.get(pk=id)
    except StitchingJob.DoesNotExist as exc:
        raise GraphQLError("Stitching job not found.") from exc

    prev_status = job.status

    if job.status in (StitchingJob.Status.READY, StitchingJob.Status.MOVED):
        raise GraphQLError(
            f"Job is already {job.status.lower().replace('_', ' ')} — only move to Finished Goods is allowed."
        )
    if pieces_completed is not None and pieces_completed < 0:
        raise GraphQLError("Pieces completed cannot be negative.")
    if pieces_rejected is not None and pieces_rejected < 0:
        raise GraphQLError("Pieces rejected cannot be negative.")
    new_completed = pieces_completed if pieces_completed is not None else job.pieces_completed
    new_rejected = pieces_rejected if pieces_rejected is not None else job.pieces_rejected
    if new_completed + new_rejected > job.pieces_assigned:
        raise GraphQLError(
            f"Pieces completed ({new_completed}) + rejected ({new_rejected}) = {new_completed + new_rejected} "
            f"cannot exceed pieces assigned ({job.pieces_assigned})."
        )
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
    if status == StitchingJob.Status.READY and prev_status != StitchingJob.Status.READY:
        notify_managers(
            title=f"Stitching Ready: {job.job_number}",
            message=f"{job.tailor.user.username} completed {job.pieces_completed} pieces "
                    f"(job {job.job_number}) — ready to move to Finished Goods.",
            level="INFO",
            link="stitching",
        )
    return job


def create_finished_products(*, user, stitching_job_id=None, readymade_stock_id=None,
                              item_type_id=None, cloth_category_id=None, cloth_color_id=None,
                              age_group="", size="", quantity, warehouse_id, cost_price, sale_price):
    from warehouse.permissions import get_warehouse
    from warehouse.models import ReadymadeStock

    warehouse = get_warehouse(user, warehouse_id)
    source = FinishedProduct.Source.IN_HOUSE if stitching_job_id else FinishedProduct.Source.IMPORTED

    sj = None
    rs = None

    with transaction.atomic():
        if quantity <= 0:
            raise GraphQLError("Quantity must be greater than zero.")

        if stitching_job_id:
            try:
                sj = StitchingJob.objects.select_for_update().get(pk=stitching_job_id)
            except StitchingJob.DoesNotExist as exc:
                raise GraphQLError("Stitching job not found.") from exc

            # The eligible/already-moved figures were only used to set the job
            # status, never to cap the quantity — so one job could be moved to
            # finished goods over and over, minting stock that was never stitched.
            eligible = (sj.pieces_completed or 0) - (sj.pieces_rejected or 0)
            already_moved = FinishedProduct.objects.filter(stitching_job=sj).aggregate(
                t=Sum("quantity"))["t"] or 0
            if already_moved + quantity > eligible:
                raise GraphQLError(
                    f"Job {sj.job_number} has {eligible - already_moved} piece(s) left to move "
                    f"({eligible} stitched, {already_moved} already moved)."
                )

            item_type_id = sj.cutting_assignment.item_type_id
            cloth_category_id = sj.cutting_assignment.raw_cloth_batch.cloth_category_id
            cloth_color_id = sj.cutting_assignment.raw_cloth_batch.cloth_color_id
            age_group = sj.cutting_assignment.age_group
            size = sj.cutting_assignment.size

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
            age_group = rs.age_group

        fp = FinishedProduct.objects.create(
            item_type_id=item_type_id,
            cloth_category_id=cloth_category_id,
            cloth_color_id=cloth_color_id,
            age_group=age_group.strip() if age_group else "",
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

        if sj:
            if already_moved + quantity >= eligible:
                sj.status = StitchingJob.Status.MOVED
                sj.save(update_fields=["status"])
            # else keep READY — more pieces still to be moved

        return fp
