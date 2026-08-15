from django.contrib.auth import get_user_model
from graphql import GraphQLError

from warehouse.models import CustomRole, EmployeeProfile, WarehouseLocation

User = get_user_model()


def create_employee(*, caller, username, password, role, warehouse_ids, email="", phone="", custom_role_id=None):
    role = role.upper()
    if role not in EmployeeProfile.Role.values:
        raise GraphQLError("Invalid role.")
    if role == EmployeeProfile.Role.SUPER_ADMIN and caller.role != EmployeeProfile.Role.SUPER_ADMIN:
        raise GraphQLError("Only a Super Administrator can create another Super Administrator.")
    if role == EmployeeProfile.Role.ADMIN and caller.role != EmployeeProfile.Role.SUPER_ADMIN:
        raise GraphQLError("Only a Super Administrator can create Administrator accounts.")
    if User.objects.filter(username__iexact=username.strip()).exists():
        raise GraphQLError("A user with this username already exists.")

    custom_role = None
    if custom_role_id:
        try:
            custom_role = CustomRole.objects.get(pk=custom_role_id)
            role = custom_role.backend_level
        except CustomRole.DoesNotExist as exc:
            raise GraphQLError("Custom role not found.") from exc

    warehouses = list(WarehouseLocation.objects.filter(pk__in=warehouse_ids, active=True))
    user = User.objects.create_user(username=username.strip(), email=email.strip(), password=password)
    profile = EmployeeProfile.objects.create(user=user, role=role, phone=phone.strip(), custom_role=custom_role)
    profile.locations.set(warehouses)
    return profile


def update_employee(*, caller, profile_id, requesting_user, **kwargs):
    try:
        profile = EmployeeProfile.objects.select_related("user").get(pk=profile_id)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Employee not found.") from exc

    if profile.role in (EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN):
        if caller.role != EmployeeProfile.Role.SUPER_ADMIN:
            raise GraphQLError("Only a Super Administrator can manage Admin/Super-Admin accounts.")

    if "custom_role_id" in kwargs:
        crid = kwargs.pop("custom_role_id")
        if crid:
            try:
                cr = CustomRole.objects.get(pk=crid)
                profile.custom_role = cr
                profile.role = cr.backend_level
            except CustomRole.DoesNotExist as exc:
                raise GraphQLError("Custom role not found.") from exc
        else:
            profile.custom_role = None

    if "role" in kwargs and kwargs["role"]:
        new_role = kwargs["role"].upper()
        if new_role in (EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN):
            if caller.role != EmployeeProfile.Role.SUPER_ADMIN:
                raise GraphQLError("Only a Super Administrator can assign elevated roles.")
        profile.role = new_role

    if "phone" in kwargs and kwargs["phone"] is not None:
        profile.phone = kwargs["phone"].strip()

    if "active" in kwargs and kwargs["active"] is not None:
        if not kwargs["active"] and profile.user == requesting_user:
            raise GraphQLError("You cannot deactivate your own account.")
        profile.active = kwargs["active"]

    if "email" in kwargs and kwargs["email"] is not None:
        profile.user.email = kwargs["email"].strip()
        profile.user.save(update_fields=["email"])

    if "warehouse_ids" in kwargs and kwargs["warehouse_ids"] is not None:
        warehouses = list(WarehouseLocation.objects.filter(pk__in=kwargs["warehouse_ids"], active=True))
        profile.locations.set(warehouses)

    profile.save()
    return profile


def reset_employee_password(*, caller, profile_id, new_password):
    try:
        profile = EmployeeProfile.objects.select_related("user").get(pk=profile_id)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Employee not found.") from exc
    if profile.role in (EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN):
        if caller.role != EmployeeProfile.Role.SUPER_ADMIN:
            raise GraphQLError("Only a Super Administrator can reset Admin passwords.")
    if len(new_password) < 8:
        raise GraphQLError("Password must be at least 8 characters.")
    profile.user.set_password(new_password)
    profile.user.save(update_fields=["password"])
    return True
