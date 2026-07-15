import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.audit import log_action
from warehouse.services.notify import notify_managers
from warehouse.services.purchase_bill import create_purchase_bill
from warehouse.schema.types import PurchaseBillType


class PurchaseBillItemInput(graphene.InputObjectType):
    item_kind = graphene.String(required=True)
    # Raw cloth
    cloth_category_id = graphene.ID()
    cloth_color_id = graphene.ID()
    total_meters = graphene.Float()
    cost_per_meter = graphene.Float()
    bin_location = graphene.String()
    cloth_code = graphene.String()
    # Readymade
    item_type_id = graphene.ID()
    size = graphene.String()
    quantity = graphene.Int()
    unit_price = graphene.Float()
    notes = graphene.String()


class CreatePurchaseBill(graphene.Mutation):
    class Arguments:
        supplier_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        items = graphene.List(graphene.NonNull(PurchaseBillItemInput), required=True)
        total_amount = graphene.Float()
        amount_paid = graphene.Float()
        invoice_ref = graphene.String()
        bill_image = graphene.String()
        notes = graphene.String()
        bill_date = graphene.Date()

    purchase_bill = graphene.Field(PurchaseBillType)

    @login_required
    def mutate(self, info, supplier_id, warehouse_id, items, **kwargs):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN,
            EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.STORE_KEEPER,
        )
        bill = create_purchase_bill(
            user=info.context.user,
            supplier_id=supplier_id,
            warehouse_id=warehouse_id,
            items=[dict(i) for i in items],
            **kwargs,
        )
        log_action(
            entity_type="PurchaseBill", entity_id=bill.pk, action="CREATED",
            actor=info.context.user,
            detail={"bill_number": bill.bill_number, "supplier": bill.supplier.name,
                    "total": str(bill.total_amount), "paid": str(bill.amount_paid)},
        )
        notify_managers(
            title=f"Purchase Bill: {bill.bill_number}",
            message=f"{bill.bill_number} from {bill.supplier.name} — ₹{bill.total_amount} (paid ₹{bill.amount_paid})",
            link="purchase_bills",
        )
        return CreatePurchaseBill(purchase_bill=bill)
