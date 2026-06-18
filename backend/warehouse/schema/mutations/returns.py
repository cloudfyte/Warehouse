import graphene
from django.db import transaction
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.returns import create_return
from warehouse.schema.types import ReturnRecordType


class CreateReturn(graphene.Mutation):
    class Arguments:
        product_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        return_type = graphene.String(required=True)
        condition = graphene.String(required=True)
        quantity = graphene.Int(required=True)
        vendor_id = graphene.ID()
        reference = graphene.String()
        reason = graphene.String(required=True)

    return_record = graphene.Field(ReturnRecordType)

    @login_required
    @transaction.atomic
    def mutate(self, info, product_id, warehouse_id, return_type, condition,
               quantity, reason, vendor_id=None, reference=""):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN,
            EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.INVENTORY_OPERATOR,
        )
        return CreateReturn(return_record=create_return(
            user=info.context.user, product_id=product_id, warehouse_id=warehouse_id,
            return_type=return_type, condition=condition, quantity=quantity,
            reason=reason, vendor_id=vendor_id, reference=reference,
        ))
