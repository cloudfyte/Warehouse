"""
Read-only query functions. No writes happen here — only filtered querysets
and aggregations. Called by schema/queries.py resolvers.
"""
from django.db.models import F, Sum

from .models import (
    DamagedProduct,
    EmployeeProfile,
    InventoryBalance,
    Notification,
    Product,
    ReplenishmentRequest,
    ReturnRecord,
    SystemSettings,
    Vendor,
    WarehouseLocation,
)
from .permissions import ELEVATED_ROLES, accessible_warehouses, get_profile


def get_system_settings():
    return SystemSettings.load()


def get_notifications(user, unread_only=False):
    qs = Notification.objects.filter(recipient=user)
    return qs.filter(read=False) if unread_only else qs[:100]


def get_replenishment_requests(user, limit=50):
    profile = get_profile(user)
    allowed = {EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER}
    if profile.role not in allowed:
        return ReplenishmentRequest.objects.none()
    return (
        ReplenishmentRequest.objects
        .select_related("product", "vendor", "warehouse", "created_by")
        .filter(warehouse__in=accessible_warehouses(user))
        [: min(limit, 100)]
    )


def get_warehouse_locations(user):
    profile = get_profile(user)
    if profile.role in ELEVATED_ROLES:
        return WarehouseLocation.objects.order_by("name")
    return profile.locations.filter(active=True)


def get_employee_profile(user):
    return get_profile(user)


def get_employees(user):
    profile = get_profile(user)
    allowed = {EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER}
    if profile.role not in allowed:
        return EmployeeProfile.objects.none()
    qs = EmployeeProfile.objects.select_related("user").prefetch_related("locations")
    if profile.role == EmployeeProfile.Role.MANAGER:
        qs = qs.filter(locations__in=accessible_warehouses(user)).distinct()
    return qs


def get_inventory_balances(user, warehouse_id=None):
    qs = InventoryBalance.objects.select_related("product", "warehouse").filter(
        warehouse__in=accessible_warehouses(user),
        product__active=True,
    )
    return qs.filter(warehouse_id=warehouse_id) if warehouse_id else qs


def get_products(user, search=None, low_stock_only=False):
    qs = (
        Product.objects
        .select_related("vendor")
        .prefetch_related("balances__warehouse")
        .filter(active=True)
    )
    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(name__icontains=search)
            | Q(sku__icontains=search)
            | Q(category__icontains=search)
        )
    if low_stock_only:
        qs = qs.filter(
            balances__warehouse__in=accessible_warehouses(user),
            balances__quantity__lte=F("balances__reorder_level"),
        ).distinct()
    return qs


def get_vendors():
    return Vendor.objects.filter(active=True)


def get_stock_movements(user, limit=30):
    from .models import StockMovement
    return (
        StockMovement.objects
        .select_related("product", "created_by", "warehouse")
        .filter(warehouse__in=accessible_warehouses(user))
        [: min(limit, 100)]
    )


def get_returns(user, limit=30):
    return (
        ReturnRecord.objects
        .select_related("product", "vendor", "warehouse")
        .filter(warehouse__in=accessible_warehouses(user))
        [: min(limit, 100)]
    )


def get_damaged_products(user, limit=30):
    return (
        DamagedProduct.objects
        .select_related("product", "vendor", "warehouse")
        .filter(warehouse__in=accessible_warehouses(user))
        [: min(limit, 100)]
    )


def get_dashboard_stats(user):
    from .schema.types import DashboardStats
    warehouses = accessible_warehouses(user)
    products = Product.objects.filter(active=True)
    balances = InventoryBalance.objects.filter(warehouse__in=warehouses, product__active=True)
    damaged = DamagedProduct.objects.filter(
        warehouse__in=warehouses,
        status=DamagedProduct.Status.QUARANTINED,
    )
    return DashboardStats(
        total_products=products.count(),
        total_units=balances.aggregate(total=Sum("quantity"))["total"] or 0,
        low_stock_products=(
            balances.filter(quantity__lte=F("reorder_level"))
            .values("product").distinct().count()
        ),
        total_vendors=Vendor.objects.filter(active=True).count(),
        pending_returns=ReturnRecord.objects.filter(
            warehouse__in=warehouses,
            status=ReturnRecord.Status.PENDING,
        ).count(),
        damaged_units=damaged.aggregate(total=Sum("quantity"))["total"] or 0,
        inventory_value=sum(
            b.quantity * b.product.unit_price
            for b in balances.select_related("product")
        ),
    )
