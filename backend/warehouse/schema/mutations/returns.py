import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.returns import create_buyer_return, create_supplier_return, process_buyer_return
from warehouse.schema.types import BuyerReturnType, SupplierReturnType

_R = EmployeeProfile.Role


class CreateBuyerReturn(graphene.Mutation):
    class Arguments:
        buyer_id = graphene.ID(required=True)
        finished_product_id = graphene.ID(required=True)
        quantity = graphene.Int(required=True)
        condition = graphene.String(required=True)
        reason = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        sales_order_id = graphene.ID()

    buyer_return = graphene.Field(BuyerReturnType)

    @login_required
    def mutate(self, info, buyer_id, finished_product_id, quantity, condition, reason,
               warehouse_id, sales_order_id=None):
        require_role(info.context.user, _R.ADMIN, _R.MANAGER, _R.STORE_KEEPER)
        ret = create_buyer_return(
            user=info.context.user,
            buyer_id=buyer_id,
            finished_product_id=finished_product_id,
            quantity=quantity,
            condition=condition,
            reason=reason,
            warehouse_id=warehouse_id,
            sales_order_id=sales_order_id,
        )
        return CreateBuyerReturn(buyer_return=ret)


class ProcessBuyerReturn(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String(required=True)

    buyer_return = graphene.Field(BuyerReturnType)

    @login_required
    def mutate(self, info, id, status):
        require_role(info.context.user, _R.ADMIN, _R.MANAGER, _R.STORE_KEEPER)
        ret = process_buyer_return(id=id, status=status)
        return ProcessBuyerReturn(buyer_return=ret)


class CreateSupplierReturn(graphene.Mutation):
    class Arguments:
        supplier_id = graphene.ID(required=True)
        return_kind = graphene.String(required=True)
        reason = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        raw_cloth_batch_id = graphene.ID()
        meters_returned = graphene.Float()
        readymade_stock_id = graphene.ID()
        quantity_returned = graphene.Int()

    supplier_return = graphene.Field(SupplierReturnType)

    @login_required
    def mutate(self, info, supplier_id, return_kind, reason, warehouse_id,
               raw_cloth_batch_id=None, meters_returned=None,
               readymade_stock_id=None, quantity_returned=None):
        require_role(info.context.user, _R.ADMIN, _R.MANAGER, _R.STORE_KEEPER)
        ret = create_supplier_return(
            user=info.context.user,
            supplier_id=supplier_id,
            return_kind=return_kind,
            reason=reason,
            warehouse_id=warehouse_id,
            raw_cloth_batch_id=raw_cloth_batch_id,
            meters_returned=meters_returned,
            readymade_stock_id=readymade_stock_id,
            quantity_returned=quantity_returned,
        )
        return CreateSupplierReturn(supplier_return=ret)
