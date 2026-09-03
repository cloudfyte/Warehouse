"""Cutting assignments and stitching jobs — the production pipeline."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import CuttingAssignment, EmployeeProfile, FinishedProduct, ItemType, RawClothBatch, StitchingJob
from warehouse.permissions import get_scoped, get_warehouse, require_role
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
        batch = get_scoped(user, RawClothBatch, raw_cloth_batch_id, lock=True, active=True)

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
            rs = get_scoped(user, ReadymadeStock, readymade_stock_id, lock=True)
            if rs.quantity_available < quantity:
                raise GraphQLError(f"Only {rs.quantity_available} units available.")
            rs.quantity_available -= quantity
            rs.save(update_fields=["quantity_available"])
            # The stock row is what the goods physically are, so it settles the
            # description. Size and category used to be left to the caller, so
            # any caller that did not repeat them back minted a sizeless,
            # uncategorised product out of a perfectly well-described delivery.
            item_type_id = rs.item_type_id
            cloth_color_id = rs.cloth_color_id
            age_group = rs.age_group
            size = rs.size or size
            cloth_category_id = rs.cloth_category_id or cloth_category_id

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


# Editable without touching stock. Quantity is deliberately absent: it is derived
# from the stitching job or readymade batch the goods came from, and letting it
# be typed over would mint or destroy pieces that the rest of the pipeline has
# already accounted for.
def _has_shipped_to_retail(fp):
    """Has any consignment carrying this product actually landed at the shop?"""
    from warehouse.models import RetailDispatch

    return fp.retail_dispatch_items.filter(
        dispatch__status=RetailDispatch.Status.ACKNOWLEDGED).exists()


_FP_DESCRIPTIVE = ("name", "size", "age_group", "cloth_color_id", "cloth_category_id", "item_type_id")
_FP_PRICING = ("cost_price", "sale_price")


def update_finished_product(*, user, id, **changes):
    """
    Correct the details of goods already in finished stock.

    Repricing is an admin/manager decision; fixing a size or a colour that was
    picked wrong on the way in is ordinary store-keeper work, so the two are
    gated separately.
    """
    from warehouse.models import ReorderPoint
    from warehouse.permissions import accessible_warehouses, require_role

    minimum = changes.pop("min_stock", None)
    changes = {k: v for k, v in changes.items() if v is not None}
    if minimum is not None:
        changes.setdefault("_touch", True)
    if not changes:
        raise GraphQLError("Nothing to update.")
    changes.pop("_touch", None)

    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
                 EmployeeProfile.Role.STORE_KEEPER)
    if any(k in changes for k in _FP_PRICING):
        require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)

    # Scoped by warehouse: ids are sequential, so a bare get(pk=) let anyone
    # reprice stock in a warehouse they are not assigned to.
    try:
        fp = FinishedProduct.objects.get(pk=id, warehouse__in=accessible_warehouses(user))
    except FinishedProduct.DoesNotExist as exc:
        raise GraphQLError("Finished product not found.") from exc

    # Whatever figure the barcode buries — cost by default — decides whether the
    # code has to be re-minted, not the sale price specifically.
    old_encoded = fp.barcode_price()
    updated = []
    if "tags_printed" in changes:
        fp.tags_printed = bool(changes["tags_printed"])
        updated.append("tags_printed")

    for field in _FP_PRICING:
        if field in changes:
            price = Decimal(str(changes[field]))
            if price < 0:
                raise GraphQLError("Prices cannot be negative.")
            setattr(fp, field, price)
            updated.append(field)

    for field in _FP_DESCRIPTIVE:
        if field in changes:
            value = changes[field]
            setattr(fp, field, value.strip() if isinstance(value, str) else value)
            updated.append(field)

    # The price lives inside the barcode, so a new price means a new code. The
    # old one is kept and stays scannable: tags are already sewn onto garments
    # hanging on the rack, and repricing must not turn those into dead labels.
    #
    # Unless the product has gone to the retail shop. Over there the barcode is
    # a single column with no history, so a re-mint leaves the shop holding
    # tags their own till cannot scan — the garment stops being sellable. A
    # stale cost inside the code is the smaller harm than that, so once a
    # consignment has landed the code is frozen and the price alone moves.
    if fp.barcode_price() != old_encoded and not _has_shipped_to_retail(fp):
        retired = [c for c in ([fp.barcode] + fp.past_codes()) if c]
        fp.previous_barcodes = ",".join(dict.fromkeys(retired))
        fp.barcode = fp.mint_barcode()
        fp.barcode_svg = generate_barcode_svg(fp.barcode)
        # A reprice invalidates whatever is on the rack, so the tag needs reprinting.
        fp.tags_printed = False
        updated += ["previous_barcodes", "barcode", "barcode_svg", "tags_printed"]

    if updated:
        fp.save(update_fields=updated + ["updated_at"])

    # The minimum is the only reason this product would ever raise an alert.
    # Setting it to zero removes the reorder point rather than leaving a silent
    # one behind, so "stop warning me about this" actually stops the warning.
    if minimum is not None:
        minimum = int(minimum)
        if minimum < 0:
            raise GraphQLError("Minimum stock cannot be negative.")
        if minimum > 0:
            ReorderPoint.objects.update_or_create(
                item_kind=ReorderPoint.ItemKind.FINISHED,
                item_type_id=fp.item_type_id,
                size=fp.size,
                warehouse_id=fp.warehouse_id,
                defaults={"threshold_pieces": minimum, "active": True},
            )
        else:
            ReorderPoint.objects.filter(
                item_kind=ReorderPoint.ItemKind.FINISHED,
                item_type_id=fp.item_type_id,
                size=fp.size,
                warehouse_id=fp.warehouse_id,
            ).delete()

    return fp


# Dimension names that also live as columns on FinishedProduct. Mirroring them
# keeps tags, filters and every existing query working while arbitrary new
# dimensions cost nothing but an option row.
_MIRRORED = {
    "size": "size",
    "age": "age_group",
    "age group": "age_group",
    "agegroup": "age_group",
}
_COLOUR_NAMES = {"colour", "color", "cloth colour", "cloth color"}


def create_product_matrix(*, user, item_type_id, warehouse_id, rows,
                          cloth_category_id=None, source="IMPORTED",
                          set_name=None, set_quantity=0):
    """
    Create one finished product per dimension combination, in a single action.

    rows = [{options: [{name, value}], quantity, cost_price, sale_price, min_stock}]

    Give ``set_name`` and the generated products are also bundled into a set
    holding one of each — a size run is the usual reason to generate a matrix
    and the usual thing to sell as a set, and doing it in two steps meant
    picking the same seven products again by hand.

    The combinations are worked out on the client so each one can have its
    quantity and prices adjusted before anything is saved — a size run is rarely
    the same count in every size, and discovering that after the fact means
    editing rows one by one.
    """
    from warehouse.models import ClothColor, FinishedProductOption, ItemType, ReorderPoint

    warehouse = get_warehouse(user, warehouse_id)
    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
                 EmployeeProfile.Role.STORE_KEEPER)

    if not rows:
        raise GraphQLError("Add at least one combination.")
    if not ItemType.objects.filter(pk=item_type_id).exists():
        raise GraphQLError("Item type not found.")

    source = (source or "IMPORTED").upper()
    if source not in FinishedProduct.Source.values:
        raise GraphQLError("Source must be IN_HOUSE or IMPORTED.")

    created = []
    with transaction.atomic():
        for index, row in enumerate(rows):
            options = row.get("options") or []
            if not options:
                raise GraphQLError("Every combination needs at least one dimension.")

            quantity = int(row.get("quantity") or 0)
            if quantity < 0:
                raise GraphQLError("Quantity cannot be negative.")
            cost = Decimal(str(row.get("cost_price") or 0))
            sale = Decimal(str(row.get("sale_price") or 0))
            if cost < 0 or sale < 0:
                raise GraphQLError("Prices cannot be negative.")

            mirrored = {}
            colour = None
            seen = set()
            for option in options:
                name = (option.get("name") or "").strip()
                value = (option.get("value") or "").strip()
                if not name or not value:
                    raise GraphQLError("Every dimension needs a name and a value.")
                key = name.lower()
                if key in seen:
                    raise GraphQLError(f"'{name}' appears twice in one combination.")
                seen.add(key)

                if key in _MIRRORED:
                    mirrored[_MIRRORED[key]] = value
                elif key in _COLOUR_NAMES:
                    # Matched, never created: an unrecognised colour becomes an
                    # option row rather than quietly adding to the master list.
                    colour = ClothColor.objects.filter(name__iexact=value).first()

            product = FinishedProduct.objects.create(
                item_type_id=item_type_id,
                cloth_category_id=cloth_category_id,
                cloth_color=colour,
                size=mirrored.get("size", ""),
                age_group=mirrored.get("age_group", ""),
                source=source,
                quantity=quantity,
                warehouse=warehouse,
                cost_price=cost,
                sale_price=sale,
            )
            product.barcode_svg = generate_barcode_svg(product.barcode)
            product.save(update_fields=["barcode_svg"])

            # A minimum given here is the whole reason an alert would ever fire
            # for this product. Leave it blank and the product is simply never
            # reported as low or out — which is what you want for the many items
            # nobody intends to keep in stock.
            minimum = int(row.get("min_stock") or 0)
            if minimum > 0:
                ReorderPoint.objects.update_or_create(
                    item_kind=ReorderPoint.ItemKind.FINISHED,
                    item_type_id=item_type_id,
                    size=product.size,
                    warehouse=warehouse,
                    defaults={"threshold_pieces": minimum, "active": True},
                )

            FinishedProductOption.objects.bulk_create([
                FinishedProductOption(
                    finished_product=product,
                    name=(o.get("name") or "").strip(),
                    value=(o.get("value") or "").strip(),
                    sort_order=i,
                )
                for i, o in enumerate(options)
            ])
            created.append(product)

        if set_name and set_name.strip():
            # Built inside the same transaction, so a set that cannot be
            # assembled takes the products down with it rather than leaving a
            # half-made run behind.
            from warehouse.services.product_set import create_product_set

            product_set = create_product_set(
                user=user,
                name=set_name,
                item_type_id=item_type_id,
                warehouse_id=warehouse_id,
                lines=[{"finished_product_id": p.pk, "pieces_per_set": 1} for p in created],
                quantity=int(set_quantity or 0),
            )
            return created, product_set

    return created, None
