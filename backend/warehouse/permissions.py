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


def scoped(user, model):
    """Rows of a warehouse-owned model that this user is allowed to act on.

    A role check alone only proves the caller is, say, a manager somewhere —
    not that the row they named belongs to a warehouse they were assigned. Any
    mutation that accepts an object id has to narrow the lookup through here,
    otherwise a store keeper at one branch can move another branch's stock just
    by sending its id.

    Returns a queryset so callers can still add select_for_update() or their
    own filters.
    """
    return model.objects.filter(warehouse__in=accessible_warehouses(user))


def get_scoped(user, model, pk, *, lock=False, **filters):
    """Fetch one row of a warehouse-owned model, or raise if it is out of reach.

    The message deliberately does not distinguish "does not exist" from "not
    yours" — that difference tells an unauthorised caller which ids are real.
    """
    qs = scoped(user, model)
    if lock:
        qs = qs.select_for_update()
    obj = qs.filter(pk=pk, **filters).first()
    if obj is None:
        raise GraphQLError(
            f"{model._meta.verbose_name.capitalize()} not found in your warehouses."
        )
    return obj


def get_finished_product(user, product_id):
    return get_scoped(user, FinishedProduct, product_id, active=True)
