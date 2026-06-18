from graphql import GraphQLError

from .models import EmployeeProfile, Product, WarehouseLocation

ELEVATED_ROLES = {EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN}


def get_profile(user):
    profile, _ = EmployeeProfile.objects.get_or_create(
        user=user,
        defaults={
            "role": EmployeeProfile.Role.SUPER_ADMIN
            if user.is_superuser
            else EmployeeProfile.Role.INVENTORY_OPERATOR
        },
    )
    if not profile.active:
        raise GraphQLError("Your warehouse employee account is inactive.")
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
    warehouse = accessible_warehouses(user).filter(pk=warehouse_id).first()
    if not warehouse:
        raise GraphQLError("Warehouse not found or not assigned to your account.")
    return warehouse


def get_product(product_id):
    try:
        return Product.objects.select_for_update().get(pk=product_id, active=True)
    except Product.DoesNotExist as exc:
        raise GraphQLError("Product not found.") from exc
