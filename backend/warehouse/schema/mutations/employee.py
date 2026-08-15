import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.employee import create_employee, reset_employee_password, update_employee
from warehouse.schema.types import EmployeeProfileType


class CreateEmployee(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        password = graphene.String(required=True)
        role = graphene.String(required=True)
        warehouse_ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        email = graphene.String()
        phone = graphene.String()
        custom_role_id = graphene.ID()

    employee = graphene.Field(EmployeeProfileType)

    @login_required
    def mutate(self, info, username, password, role, warehouse_ids, email="", phone="", custom_role_id=None):
        caller = require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return CreateEmployee(employee=create_employee(
            caller=caller, username=username, password=password, role=role,
            warehouse_ids=warehouse_ids, email=email, phone=phone, custom_role_id=custom_role_id,
        ))


class UpdateEmployee(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        role = graphene.String()
        phone = graphene.String()
        email = graphene.String()
        active = graphene.Boolean()
        warehouse_ids = graphene.List(graphene.NonNull(graphene.ID))
        custom_role_id = graphene.ID()

    employee = graphene.Field(EmployeeProfileType)

    @login_required
    def mutate(self, info, id, custom_role_id=None, **kwargs):
        caller = require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return UpdateEmployee(employee=update_employee(
            caller=caller, profile_id=id, requesting_user=info.context.user,
            custom_role_id=custom_role_id, **kwargs,
        ))


class UpdateMyProfile(graphene.Mutation):
    """Any authenticated user can update their own email and phone."""

    class Arguments:
        email = graphene.String()
        phone = graphene.String()

    employee = graphene.Field(EmployeeProfileType)

    @login_required
    def mutate(self, info, email=None, phone=None):
        user = info.context.user
        if email is not None:
            user.email = email.strip()
            user.save(update_fields=["email"])
        profile = EmployeeProfile.objects.filter(user=user).first()
        if profile is None:
            raise GraphQLError("No employee profile found for this account.")
        if phone is not None:
            profile.phone = phone.strip()
            profile.save(update_fields=["phone"])
        return UpdateMyProfile(employee=profile)


class ChangeMyPassword(graphene.Mutation):
    """Any authenticated user can change their own password (must supply current password)."""

    class Arguments:
        current_password = graphene.String(required=True)
        new_password = graphene.String(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, current_password, new_password):
        user = info.context.user
        if not user.check_password(current_password):
            raise GraphQLError("Current password is incorrect.")
        if len(new_password) < 6:
            raise GraphQLError("New password must be at least 6 characters.")
        user.set_password(new_password)
        user.save(update_fields=["password"])
        return ChangeMyPassword(ok=True)


class ResetEmployeePassword(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        new_password = graphene.String(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, id, new_password):
        caller = require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        reset_employee_password(caller=caller, profile_id=id, new_password=new_password)
        return ResetEmployeePassword(ok=True)
