import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.audit import log_action
from warehouse.services.supplier_payment import create_supplier_payment, delete_supplier_payment
from warehouse.schema.types import SupplierPaymentType

PAYMENT_ROLES = (
    EmployeeProfile.Role.SUPER_ADMIN,
    EmployeeProfile.Role.ADMIN,
    EmployeeProfile.Role.MANAGER,
)


class CreateSupplierPayment(graphene.Mutation):
    class Arguments:
        bill_id = graphene.ID(required=True)
        amount = graphene.Float(required=True)
        payment_date = graphene.Date()
        payment_mode = graphene.String()
        reference = graphene.String()
        notes = graphene.String()

    payment = graphene.Field(SupplierPaymentType)

    @login_required
    def mutate(self, info, bill_id, amount, **kwargs):
        require_role(info.context.user, *PAYMENT_ROLES)
        p = create_supplier_payment(
            user=info.context.user, bill_id=bill_id, amount=amount, **kwargs
        )
        log_action(
            entity_type="SupplierPayment", entity_id=p.pk, action="CREATED",
            actor=info.context.user,
            detail={"payment_number": p.payment_number, "bill": p.bill.bill_number,
                    "amount": str(p.amount), "mode": p.payment_mode},
        )
        return CreateSupplierPayment(payment=p)


class DeleteSupplierPayment(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, *PAYMENT_ROLES)
        log_action(
            entity_type="SupplierPayment", entity_id=id, action="DELETED",
            actor=info.context.user, detail={},
        )
        delete_supplier_payment(user=info.context.user, payment_id=id)
        return DeleteSupplierPayment(ok=True)
