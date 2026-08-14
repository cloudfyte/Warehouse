import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.stock_transfer import (
    cancel_stock_transfer, create_stock_transfer,
    dispatch_stock_transfer, receive_stock_transfer,
)
from warehouse.schema.types import StockTransferType


class CreateStockTransfer(graphene.Mutation):
    class Arguments:
        from_warehouse_id = graphene.ID(required=True)
        to_warehouse_id = graphene.ID(required=True)
        transfer_kind = graphene.String(required=True)
        raw_cloth_batch_id = graphene.ID()
        meters_to_transfer = graphene.Float()
        finished_product_id = graphene.ID()
        quantity_to_transfer = graphene.Int()
        notes = graphene.String()

    transfer = graphene.Field(StockTransferType)

    @login_required
    def mutate(self, info, from_warehouse_id, to_warehouse_id, transfer_kind, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        return CreateStockTransfer(transfer=create_stock_transfer(
            user=info.context.user,
            from_warehouse_id=from_warehouse_id,
            to_warehouse_id=to_warehouse_id,
            transfer_kind=transfer_kind,
            **kwargs,
        ))


class DispatchStockTransfer(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    transfer = graphene.Field(StockTransferType)

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        return DispatchStockTransfer(transfer=dispatch_stock_transfer(transfer_id=id, user=info.context.user))


class ReceiveStockTransfer(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    transfer = graphene.Field(StockTransferType)

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        return ReceiveStockTransfer(transfer=receive_stock_transfer(transfer_id=id, user=info.context.user))


class CancelStockTransfer(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    transfer = graphene.Field(StockTransferType)

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CancelStockTransfer(transfer=cancel_stock_transfer(transfer_id=id, user=info.context.user))
