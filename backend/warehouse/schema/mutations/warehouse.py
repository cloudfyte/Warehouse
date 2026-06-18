import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.warehouse import create_warehouse, update_warehouse
from warehouse.schema.types import WarehouseLocationType


class CreateWarehouseLocation(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        code = graphene.String(required=True)
        address = graphene.String()
        city = graphene.String()
        state = graphene.String()
        pincode = graphene.String()

    warehouse = graphene.Field(WarehouseLocationType)

    @login_required
    def mutate(self, info, name, code, address="", city="", state="", pincode=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return CreateWarehouseLocation(warehouse=create_warehouse(
            name=name, code=code, address=address, city=city, state=state, pincode=pincode,
        ))


class UpdateWarehouseLocation(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        address = graphene.String()
        city = graphene.String()
        state = graphene.String()
        pincode = graphene.String()
        active = graphene.Boolean()

    warehouse = graphene.Field(WarehouseLocationType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return UpdateWarehouseLocation(warehouse=update_warehouse(id=id, **kwargs))
