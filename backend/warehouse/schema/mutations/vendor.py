import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.vendor import create_vendor, update_vendor
from warehouse.schema.types import VendorType


class CreateVendor(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        contact_person = graphene.String()
        email = graphene.String()
        phone = graphene.String()
        address = graphene.String()
        gstin = graphene.String()

    vendor = graphene.Field(VendorType)

    @login_required
    def mutate(self, info, name, contact_person="", email="", phone="", address="", gstin=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateVendor(vendor=create_vendor(
            name=name, contact_person=contact_person, email=email,
            phone=phone, address=address, gstin=gstin,
        ))


class UpdateVendor(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        contact_person = graphene.String()
        email = graphene.String()
        phone = graphene.String()
        address = graphene.String()
        gstin = graphene.String()
        active = graphene.Boolean()

    vendor = graphene.Field(VendorType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return UpdateVendor(vendor=update_vendor(id=id, **kwargs))
