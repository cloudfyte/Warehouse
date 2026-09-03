import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.master import (
    create_cloth_category, create_cloth_color, create_item_type, create_warehouse,
    update_cloth_category, update_cloth_color, update_item_type, update_warehouse,
)
from warehouse.schema.types import ClothCategoryType, ClothColorType, ItemTypeType, WarehouseLocationType


class CreateClothCategory(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        description = graphene.String()

    category = graphene.Field(ClothCategoryType)

    @login_required
    def mutate(self, info, name, description=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateClothCategory(category=create_cloth_category(name=name, description=description))


class UpdateClothCategory(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        description = graphene.String()
        active = graphene.Boolean()

    category = graphene.Field(ClothCategoryType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return UpdateClothCategory(category=update_cloth_category(id=id, **kwargs))


class CreateClothColor(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        hex_code = graphene.String()
        # "Make sure this colour exists" — see create_cloth_color.
        reuse_existing = graphene.Boolean()

    color = graphene.Field(ClothColorType)

    @login_required
    def mutate(self, info, name, hex_code="", reuse_existing=False):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateClothColor(color=create_cloth_color(
            name=name, hex_code=hex_code, reuse_existing=reuse_existing))


class UpdateClothColor(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        hex_code = graphene.String()
        active = graphene.Boolean()

    color = graphene.Field(ClothColorType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return UpdateClothColor(color=update_cloth_color(id=id, **kwargs))


class CreateItemType(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        category = graphene.String()
        cloth_length_per_piece = graphene.Float()
        hsn_code = graphene.String()
        gst_rate = graphene.Float()

    item_type = graphene.Field(ItemTypeType)

    @login_required
    def mutate(self, info, name, category="", cloth_length_per_piece=0, hsn_code="", gst_rate=0):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateItemType(item_type=create_item_type(
            name=name, category=category, cloth_length_per_piece=cloth_length_per_piece,
            hsn_code=hsn_code, gst_rate=gst_rate,
        ))


class UpdateItemType(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        category = graphene.String()
        cloth_length_per_piece = graphene.Float()
        hsn_code = graphene.String()
        gst_rate = graphene.Float()
        active = graphene.Boolean()

    item_type = graphene.Field(ItemTypeType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return UpdateItemType(item_type=update_item_type(id=id, **kwargs))


class CreateWarehouseLocation(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        code = graphene.String(required=True)
        location_type = graphene.String()
        address = graphene.String()
        city = graphene.String()
        state = graphene.String()
        pincode = graphene.String()
        phone = graphene.String()

    warehouse = graphene.Field(WarehouseLocationType)

    @login_required
    def mutate(self, info, name, code, location_type="WAREHOUSE", address="", city="", state="", pincode="", phone=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return CreateWarehouseLocation(warehouse=create_warehouse(
            name=name, code=code, location_type=location_type,
            address=address, city=city, state=state, pincode=pincode, phone=phone,
        ))


class UpdateWarehouseLocation(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        location_type = graphene.String()
        address = graphene.String()
        city = graphene.String()
        state = graphene.String()
        pincode = graphene.String()
        phone = graphene.String()
        active = graphene.Boolean()

    warehouse = graphene.Field(WarehouseLocationType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return UpdateWarehouseLocation(warehouse=update_warehouse(id=id, **kwargs))
