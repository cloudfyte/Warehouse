"""Parcel inspection — log inspection details when a PO parcel is opened at the warehouse."""
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import ParcelInspection, PurchaseOrder
from warehouse.permissions import get_scoped
from warehouse.services.uploads import save_data_urls_csv


def create_parcel_inspection(
    *, po_id, user, parcel_condition="GOOD", quantity_check_passed=True,
    discrepancy_notes="", photos="", notes="", inspection_date=None,
):
    po = get_scoped(user, PurchaseOrder, po_id)

    if hasattr(po, "parcel_inspection"):
        raise GraphQLError("Inspection already recorded for this purchase order.")

    condition = parcel_condition.upper()
    if condition not in ParcelInspection.Condition.values:
        raise GraphQLError(f"Invalid condition. Use GOOD, PARTIAL_DAMAGE, or DAMAGED.")

    inspection = ParcelInspection.objects.create(
        purchase_order=po,
        inspected_by=user,
        inspection_date=inspection_date or timezone.now().date(),
        parcel_condition=condition,
        quantity_check_passed=quantity_check_passed,
        discrepancy_notes=discrepancy_notes.strip(),
        photos=save_data_urls_csv(photos, "parcel-inspections"),
        notes=notes.strip(),
    )
    return inspection


def update_parcel_inspection(
    *, inspection_id, parcel_condition=None, quantity_check_passed=None,
    discrepancy_notes=None, photos=None, notes=None,
):
    try:
        inspection = ParcelInspection.objects.get(pk=inspection_id)
    except ParcelInspection.DoesNotExist as exc:
        raise GraphQLError("Parcel inspection not found.") from exc

    fields = []
    if parcel_condition is not None:
        condition = parcel_condition.upper()
        if condition not in ParcelInspection.Condition.values:
            raise GraphQLError("Invalid condition.")
        inspection.parcel_condition = condition
        fields.append("parcel_condition")
    if quantity_check_passed is not None:
        inspection.quantity_check_passed = quantity_check_passed
        fields.append("quantity_check_passed")
    if discrepancy_notes is not None:
        inspection.discrepancy_notes = discrepancy_notes.strip()
        fields.append("discrepancy_notes")
    if photos is not None:
        inspection.photos = save_data_urls_csv(photos, "parcel-inspections")
        fields.append("photos")
    if notes is not None:
        inspection.notes = notes.strip()
        fields.append("notes")

    if fields:
        inspection.save(update_fields=fields)
    return inspection
