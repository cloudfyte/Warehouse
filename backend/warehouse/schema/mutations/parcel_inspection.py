import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.parcel_inspection import create_parcel_inspection, update_parcel_inspection
from warehouse.schema.types import ParcelInspectionType


class CreateParcelInspection(graphene.Mutation):
    class Arguments:
        po_id = graphene.ID(required=True)
        parcel_condition = graphene.String()
        quantity_check_passed = graphene.Boolean()
        discrepancy_notes = graphene.String()
        photos = graphene.String()
        notes = graphene.String()
        inspection_date = graphene.Date()

    inspection = graphene.Field(ParcelInspectionType)

    @login_required
    def mutate(self, info, po_id, **kwargs):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.STORE_KEEPER,
        )
        return CreateParcelInspection(inspection=create_parcel_inspection(
            po_id=po_id, user=info.context.user, **kwargs,
        ))


class UpdateParcelInspection(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        parcel_condition = graphene.String()
        quantity_check_passed = graphene.Boolean()
        discrepancy_notes = graphene.String()
        photos = graphene.String()
        notes = graphene.String()

    inspection = graphene.Field(ParcelInspectionType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.STORE_KEEPER,
        )
        return UpdateParcelInspection(inspection=update_parcel_inspection(inspection_id=id, **kwargs))
