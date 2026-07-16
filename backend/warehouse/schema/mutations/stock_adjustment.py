import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.audit import log_action
from warehouse.services.stock_adjustment import create_stock_adjustment, delete_stock_adjustment
from warehouse.schema.types import StockAdjustmentType

ADJ_ROLES = (
    EmployeeProfile.Role.SUPER_ADMIN,
    EmployeeProfile.Role.ADMIN,
    EmployeeProfile.Role.MANAGER,
    EmployeeProfile.Role.STORE_KEEPER,
)


class CreateStockAdjustment(graphene.Mutation):
    class Arguments:
        item_kind = graphene.String(required=True)
        quantity_change = graphene.Float(required=True)
        adjustment_type = graphene.String(required=True)
        reason = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        raw_cloth_batch_id = graphene.ID()
        finished_product_id = graphene.ID()

    adjustment = graphene.Field(StockAdjustmentType)

    @login_required
    def mutate(self, info, item_kind, quantity_change, adjustment_type, reason, warehouse_id, **kwargs):
        require_role(info.context.user, *ADJ_ROLES)
        adj = create_stock_adjustment(
            user=info.context.user,
            item_kind=item_kind,
            quantity_change=quantity_change,
            adjustment_type=adjustment_type,
            reason=reason,
            warehouse_id=warehouse_id,
            **kwargs,
        )
        log_action(
            entity_type="StockAdjustment", entity_id=adj.pk, action="CREATED",
            actor=info.context.user,
            detail={"adjustment_number": adj.adjustment_number, "type": adj.adjustment_type,
                    "kind": adj.item_kind, "change": str(adj.quantity_change), "reason": reason},
        )
        return CreateStockAdjustment(adjustment=adj)


class DeleteStockAdjustment(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN)
        log_action(
            entity_type="StockAdjustment", entity_id=id, action="DELETED",
            actor=info.context.user, detail={},
        )
        delete_stock_adjustment(user=info.context.user, adjustment_id=id)
        return DeleteStockAdjustment(ok=True)
