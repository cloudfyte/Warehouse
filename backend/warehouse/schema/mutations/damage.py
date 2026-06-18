import graphene
from django.db import transaction
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.damage import report_damage, resolve_damage
from warehouse.schema.types import DamagedProductType


class ReportDamage(graphene.Mutation):
    class Arguments:
        product_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        quantity = graphene.Int(required=True)
        reason = graphene.String(required=True)
        reference = graphene.String()

    damage = graphene.Field(DamagedProductType)

    @login_required
    @transaction.atomic
    def mutate(self, info, product_id, warehouse_id, quantity, reason, reference=""):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN,
            EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.INVENTORY_OPERATOR,
        )
        return ReportDamage(damage=report_damage(
            user=info.context.user, product_id=product_id, warehouse_id=warehouse_id,
            quantity=quantity, reason=reason, reference=reference,
        ))


class ResolveDamage(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String(required=True)
        notes = graphene.String()

    damage = graphene.Field(DamagedProductType)

    @login_required
    def mutate(self, info, id, status, notes=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return ResolveDamage(damage=resolve_damage(id=id, status=status, notes=notes))
