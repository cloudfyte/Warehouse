import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.reorder_point import (
    create_reorder_point, delete_reorder_point, update_reorder_point,
)
from warehouse.schema.types import ReorderPointType


class CreateReorderPoint(graphene.Mutation):
    class Arguments:
        item_kind = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        cloth_category_id = graphene.ID()
        cloth_color_id = graphene.ID()
        threshold_meters = graphene.Float()
        item_type_id = graphene.ID()
        size = graphene.String()
        threshold_pieces = graphene.Int()

    reorder_point = graphene.Field(ReorderPointType)

    @login_required
    def mutate(self, info, item_kind, warehouse_id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateReorderPoint(reorder_point=create_reorder_point(
            user=info.context.user, item_kind=item_kind, warehouse_id=warehouse_id, **kwargs,
        ))


class UpdateReorderPoint(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        threshold_meters = graphene.Float()
        threshold_pieces = graphene.Int()
        size = graphene.String()
        active = graphene.Boolean()

    reorder_point = graphene.Field(ReorderPointType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return UpdateReorderPoint(reorder_point=update_reorder_point(reorder_point_id=id, **kwargs))


class DeleteReorderPoint(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        delete_reorder_point(reorder_point_id=id)
        return DeleteReorderPoint(ok=True)
