import graphene
from django.db import transaction
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.stock import create_product, update_stock
from warehouse.schema.types import ProductType, StockMovementType


class CreateProduct(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        sku = graphene.String(required=True)
        category = graphene.String()
        description = graphene.String()
        vendor_id = graphene.ID()
        unit_price = graphene.String()
        gst_rate = graphene.String()
        hsn_code = graphene.String()
        initial_stock = graphene.Int()
        reorder_level = graphene.Int()
        location = graphene.String()
        warehouse_id = graphene.ID(required=True)

    product = graphene.Field(ProductType)

    @login_required
    @transaction.atomic
    def mutate(self, info, name, sku, warehouse_id, category="", description="",
               vendor_id=None, unit_price="0", gst_rate="0", hsn_code="",
               initial_stock=0, reorder_level=10, location=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateProduct(product=create_product(
            user=info.context.user, name=name, sku=sku, warehouse_id=warehouse_id,
            category=category, description=description, vendor_id=vendor_id,
            unit_price=unit_price, gst_rate=gst_rate, hsn_code=hsn_code,
            initial_stock=initial_stock, reorder_level=reorder_level, location=location,
        ))


class UpdateStock(graphene.Mutation):
    class Arguments:
        product_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        movement_type = graphene.String(required=True)
        quantity = graphene.Int(required=True)
        reference = graphene.String()
        notes = graphene.String()

    movement = graphene.Field(StockMovementType)

    @login_required
    @transaction.atomic
    def mutate(self, info, product_id, warehouse_id, movement_type, quantity, reference="", notes=""):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN,
            EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.INVENTORY_OPERATOR,
        )
        return UpdateStock(movement=update_stock(
            user=info.context.user, product_id=product_id, warehouse_id=warehouse_id,
            movement_type=movement_type, quantity=quantity, reference=reference, notes=notes,
        ))
