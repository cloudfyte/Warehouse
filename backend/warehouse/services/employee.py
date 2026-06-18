from django.contrib.auth import get_user_model
from graphql import GraphQLError

from warehouse.models import EmployeeProfile, WarehouseLocation


def create_employee(*, caller, username, password, role, warehouse_ids, email="", phone=""):
    role = role.upper()
    if role not in EmployeeProfile.Role.values:
        raise GraphQLError("Invalid employee role.")
    if role == EmployeeProfile.Role.SUPER_ADMIN and caller.role != EmployeeProfile.Role.SUPER_ADMIN:
        raise GraphQLError("Only a Super Administrator can create Super Administrator accounts.")

    User = get_user_model()
    if User.objects.filter(username__iexact=username.strip()).exists():
        raise GraphQLError("An employee with this username already exists.")

    warehouses = list(WarehouseLocation.objects.filter(pk__in=warehouse_ids, active=True))
    if len(warehouses) != len(set(warehouse_ids)):
        raise GraphQLError("One or more selected warehouses are invalid.")

    user = User.objects.create_user(
        username=username.strip(),
        email=email.strip(),
        password=password,
    )
    profile = EmployeeProfile.objects.create(user=user, role=role, phone=phone.strip())
    profile.locations.set(warehouses)
    return profile


def update_employee(*, caller, profile_id, requesting_user, role=None, phone=None, email=None, active=None, warehouse_ids=None):
    try:
        profile = EmployeeProfile.objects.select_related("user").get(pk=profile_id)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Employee not found.") from exc

    if (profile.role == EmployeeProfile.Role.SUPER_ADMIN
            and caller.role != EmployeeProfile.Role.SUPER_ADMIN):
        raise GraphQLError("Super Administrator accounts can only be managed by another Super Administrator.")

    if role is not None:
        role = role.upper()
        if role not in EmployeeProfile.Role.values:
            raise GraphQLError("Invalid role.")
        if role == EmployeeProfile.Role.SUPER_ADMIN and caller.role != EmployeeProfile.Role.SUPER_ADMIN:
            raise GraphQLError("Only a Super Administrator can assign the Super Administrator role.")
        profile.role = role

    if phone is not None:
        profile.phone = phone.strip()

    if active is not None:
        if active is False and profile.user == requesting_user:
            raise GraphQLError("You cannot deactivate your own account.")
        profile.active = active

    if email is not None:
        profile.user.email = email.strip()
        profile.user.save(update_fields=["email"])

    if warehouse_ids is not None:
        warehouses = list(WarehouseLocation.objects.filter(pk__in=warehouse_ids, active=True))
        profile.locations.set(warehouses)

    profile.save()
    return profile


def reset_employee_password(*, caller, profile_id, new_password):
    try:
        profile = EmployeeProfile.objects.select_related("user").get(pk=profile_id)
    except EmployeeProfile.DoesNotExist as exc:
        raise GraphQLError("Employee not found.") from exc

    if (profile.role == EmployeeProfile.Role.SUPER_ADMIN
            and caller.role != EmployeeProfile.Role.SUPER_ADMIN):
        raise GraphQLError("Super Administrator passwords can only be changed by another Super Administrator.")

    if len(new_password) < 8:
        raise GraphQLError("Password must be at least 8 characters.")

    profile.user.set_password(new_password)
    profile.user.save(update_fields=["password"])
    return True
