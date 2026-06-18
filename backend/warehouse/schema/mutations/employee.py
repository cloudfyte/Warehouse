import graphene
from django.db import transaction
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.employee import create_employee, reset_employee_password, update_employee
from warehouse.schema.types import EmployeeProfileType


class CreateEmployee(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        password = graphene.String(required=True)
        email = graphene.String()
        phone = graphene.String()
        role = graphene.String(required=True)
        warehouse_ids = graphene.List(graphene.NonNull(graphene.ID), required=True)

    employee = graphene.Field(EmployeeProfileType)

    @login_required
    @transaction.atomic
    def mutate(self, info, username, password, role, warehouse_ids, email="", phone=""):
        caller = require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return CreateEmployee(employee=create_employee(
            caller=caller, username=username, password=password, role=role,
            warehouse_ids=warehouse_ids, email=email, phone=phone,
        ))


class UpdateEmployee(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        role = graphene.String()
        phone = graphene.String()
        email = graphene.String()
        active = graphene.Boolean()
        warehouse_ids = graphene.List(graphene.NonNull(graphene.ID))

    employee = graphene.Field(EmployeeProfileType)

    @login_required
    @transaction.atomic
    def mutate(self, info, id, role=None, phone=None, email=None, active=None, warehouse_ids=None):
        caller = require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        return UpdateEmployee(employee=update_employee(
            caller=caller, profile_id=id, requesting_user=info.context.user,
            role=role, phone=phone, email=email, active=active, warehouse_ids=warehouse_ids,
        ))


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
