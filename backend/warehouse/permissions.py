from graphql import GraphQLError

from .models import EmployeeProfile, FinishedProduct, WarehouseLocation

ELEVATED_ROLES = {EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN}
MANAGEMENT_ROLES = {EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER}
PRODUCTION_ROLES = {
    EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN,
    EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER,
}


def get_profile(user):
    profile = EmployeeProfile.objects.filter(user=user).first()
    if profile is None:
        if user.is_superuser:
            # Auto-provision profile for Django superusers only
            profile = EmployeeProfile.objects.create(user=user, role=EmployeeProfile.Role.SUPER_ADMIN)
        else:
            raise GraphQLError("No employee profile found for this account. Contact an administrator.")
    if not profile.active:
        raise GraphQLError("Your account has been deactivated. Contact an administrator.")
    return profile


def require_role(user, *roles):
    profile = get_profile(user)
    if profile.role == EmployeeProfile.Role.SUPER_ADMIN:
        return profile
    if profile.role not in roles:
        raise GraphQLError("You do not have permission to perform this action.")
    return profile


def accessible_warehouses(user):
    profile = get_profile(user)
    if profile.role in ELEVATED_ROLES:
        return WarehouseLocation.objects.filter(active=True)
    return profile.locations.filter(active=True)


def get_warehouse(user, warehouse_id):
    wh = accessible_warehouses(user).filter(pk=warehouse_id).first()
    if not wh:
        raise GraphQLError("Warehouse not found or not assigned to your account.")
    return wh


def get_finished_product(product_id):
    try:
        return FinishedProduct.objects.get(pk=product_id, active=True)
    except FinishedProduct.DoesNotExist as exc:
        raise GraphQLError("Finished product not found.") from exc
