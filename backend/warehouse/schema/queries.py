import graphene
from graphql_jwt.decorators import login_required

from warehouse import selectors

from .types import (
    DashboardStats,
    DamagedProductType,
    EmployeeProfileType,
    InventoryBalanceType,
    NotificationType,
    ProductType,
    ReplenishmentRequestType,
    ReturnRecordType,
    StockMovementType,
    SystemSettingsType,
    VendorType,
    WarehouseLocationType,
)


class Query(graphene.ObjectType):
    products = graphene.List(ProductType, search=graphene.String(), low_stock_only=graphene.Boolean())
    vendors = graphene.List(VendorType)
    stock_movements = graphene.List(StockMovementType, limit=graphene.Int())
    returns = graphene.List(ReturnRecordType, limit=graphene.Int())
    damaged_products = graphene.List(DamagedProductType, limit=graphene.Int())
    dashboard_stats = graphene.Field(DashboardStats)
    warehouse_locations = graphene.List(WarehouseLocationType)
    employee_profile = graphene.Field(EmployeeProfileType)
    employees = graphene.List(EmployeeProfileType)
    inventory_balances = graphene.List(InventoryBalanceType, warehouse_id=graphene.ID())
    notifications = graphene.List(NotificationType, unread_only=graphene.Boolean())
    replenishment_requests = graphene.List(ReplenishmentRequestType, limit=graphene.Int())
    system_settings = graphene.Field(SystemSettingsType)

    def resolve_system_settings(self, info):
        return selectors.get_system_settings()

    @login_required
    def resolve_notifications(self, info, unread_only=False):
        return selectors.get_notifications(info.context.user, unread_only)

    @login_required
    def resolve_replenishment_requests(self, info, limit=50):
        return selectors.get_replenishment_requests(info.context.user, limit)

    @login_required
    def resolve_warehouse_locations(self, info):
        return selectors.get_warehouse_locations(info.context.user)

    @login_required
    def resolve_employee_profile(self, info):
        return selectors.get_employee_profile(info.context.user)

    @login_required
    def resolve_employees(self, info):
        return selectors.get_employees(info.context.user)

    @login_required
    def resolve_inventory_balances(self, info, warehouse_id=None):
        return selectors.get_inventory_balances(info.context.user, warehouse_id)

    @login_required
    def resolve_products(self, info, search=None, low_stock_only=False):
        return selectors.get_products(info.context.user, search, low_stock_only)

    @login_required
    def resolve_vendors(self, info):
        return selectors.get_vendors()

    @login_required
    def resolve_stock_movements(self, info, limit=30):
        return selectors.get_stock_movements(info.context.user, limit)

    @login_required
    def resolve_returns(self, info, limit=30):
        return selectors.get_returns(info.context.user, limit)

    @login_required
    def resolve_damaged_products(self, info, limit=30):
        return selectors.get_damaged_products(info.context.user, limit)

    @login_required
    def resolve_dashboard_stats(self, info):
        return selectors.get_dashboard_stats(info.context.user)
