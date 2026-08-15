import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required

from warehouse.models import CustomRole, EmployeeProfile
from warehouse.permissions import require_role
from warehouse.schema.types import CustomRoleType


class CreateCustomRole(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        display_name = graphene.String(required=True)
        color = graphene.String()
        backend_level = graphene.String()
        tab_permissions = graphene.JSONString(required=True)

    role = graphene.Field(CustomRoleType)

    @login_required
    def mutate(self, info, name, display_name, tab_permissions, color="#6366f1", backend_level="STORE_KEEPER"):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        slug = name.upper().replace(" ", "_").replace("-", "_")
        if CustomRole.objects.filter(name=slug).exists():
            raise GraphQLError("A role with this name already exists.")
        if backend_level not in EmployeeProfile.Role.values:
            raise GraphQLError("Invalid backend permission level.")
        role = CustomRole.objects.create(
            name=slug, display_name=display_name.strip(),
            color=color or "#6366f1", backend_level=backend_level,
            tab_permissions=tab_permissions,
        )
        return CreateCustomRole(role=role)


class UpdateCustomRole(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        display_name = graphene.String()
        color = graphene.String()
        backend_level = graphene.String()
        tab_permissions = graphene.JSONString()

    role = graphene.Field(CustomRoleType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        try:
            role = CustomRole.objects.get(pk=id)
        except CustomRole.DoesNotExist as exc:
            raise GraphQLError("Role not found.") from exc
        if "display_name" in kwargs and kwargs["display_name"]:
            role.display_name = kwargs["display_name"].strip()
        if "color" in kwargs and kwargs["color"]:
            role.color = kwargs["color"]
        if "backend_level" in kwargs and kwargs["backend_level"]:
            if kwargs["backend_level"] not in EmployeeProfile.Role.values:
                raise GraphQLError("Invalid backend permission level.")
            role.backend_level = kwargs["backend_level"]
        if "tab_permissions" in kwargs and kwargs["tab_permissions"] is not None:
            role.tab_permissions = kwargs["tab_permissions"]
        role.save()
        return UpdateCustomRole(role=role)


class DeleteCustomRole(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        try:
            role = CustomRole.objects.get(pk=id)
        except CustomRole.DoesNotExist as exc:
            raise GraphQLError("Role not found.") from exc
        if role.is_system:
            raise GraphQLError("System roles cannot be deleted.")
        if role.employees.exists():
            raise GraphQLError("Cannot delete a role that is assigned to employees. Re-assign them first.")
        role.delete()
        return DeleteCustomRole(ok=True)
