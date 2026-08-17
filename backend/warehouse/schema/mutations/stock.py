import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.stock import create_raw_cloth_batch, create_readymade_stock
from warehouse.schema.types import RawClothBatchType, ReadymadeStockType


class CreateRawClothBatch(graphene.Mutation):
    class Arguments:
        supplier_id = graphene.ID(required=True)
        category_id = graphene.ID(required=True)
        color_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        total_meters = graphene.Float(required=True)
        cost_per_meter = graphene.Float()
        bin_location = graphene.String()
        notes = graphene.String()
        received_date = graphene.Date()

    batch = graphene.Field(RawClothBatchType)

    @login_required
    def mutate(self, info, supplier_id, category_id, color_id, warehouse_id, total_meters, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        return CreateRawClothBatch(batch=create_raw_cloth_batch(
            user=info.context.user, supplier_id=supplier_id, category_id=category_id,
            color_id=color_id, warehouse_id=warehouse_id, total_meters=total_meters, **kwargs,
        ))


class CreateReadymadeStock(graphene.Mutation):
    class Arguments:
        supplier_id = graphene.ID(required=True)
        item_type_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        quantity = graphene.Int(required=True)
        cost_price = graphene.Float()
        category_id = graphene.ID()
        color_id = graphene.ID()
        size = graphene.String()
        notes = graphene.String()
        received_date = graphene.Date()

    stock = graphene.Field(ReadymadeStockType)

    @login_required
    def mutate(self, info, supplier_id, item_type_id, warehouse_id, quantity, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        return CreateReadymadeStock(stock=create_readymade_stock(
            user=info.context.user, supplier_id=supplier_id, item_type_id=item_type_id,
            warehouse_id=warehouse_id, quantity=quantity, **kwargs,
        ))
