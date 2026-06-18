import graphene
from django.db import transaction
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.replenishment import request_replenishment, update_replenishment_status
from warehouse.schema.types import ReplenishmentRequestType


class RequestReplenishment(graphene.Mutation):
    class Arguments:
        product_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        quantity = graphene.Int(required=True)
        expected_date = graphene.Date()
        notes = graphene.String()
        send_now = graphene.Boolean()

    request = graphene.Field(ReplenishmentRequestType)
    email_sent = graphene.Boolean()
    whatsapp_sent = graphene.Boolean()

    @login_required
    @transaction.atomic
    def mutate(self, info, product_id, warehouse_id, quantity,
               expected_date=None, notes="", send_now=True):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        req, email_sent, whatsapp_sent = request_replenishment(
            user=info.context.user, product_id=product_id, warehouse_id=warehouse_id,
            quantity=quantity, expected_date=expected_date, notes=notes, send_now=send_now,
        )
        return RequestReplenishment(request=req, email_sent=email_sent, whatsapp_sent=whatsapp_sent)


class UpdateReplenishmentStatus(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String(required=True)

    request = graphene.Field(ReplenishmentRequestType)

    @login_required
    def mutate(self, info, id, status):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return UpdateReplenishmentStatus(request=update_replenishment_status(id=id, status=status))
