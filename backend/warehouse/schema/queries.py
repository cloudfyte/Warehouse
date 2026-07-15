import graphene
from graphql_jwt.decorators import login_required

from warehouse import selectors

from .types import (
    AnalyticsStats,
    AuditLogType,
    BuyerReturnType,
    BuyerType,
    ClothCategoryType,
    ClothColorType,
    CreditTransactionType,
    CuttingAssignmentType,
    DashboardStats,
    EmployeeProfileType,
    FinishedProductType,
    ItemTypeType,
    NotificationType,
    ExpenseType,
    PurchaseBillType,
    PurchaseOrderType,
    RawClothBatchType,
    ReadymadeStockType,
    SalesOrderType,
    StitchingJobType,
    SupplierReturnType,
    SupplierType,
    SystemSettingsType,
    WarehouseLocationType,
)


class Query(graphene.ObjectType):
    # Public
    system_settings = graphene.Field(SystemSettingsType)

    # Master data
    cloth_categories = graphene.List(ClothCategoryType, active_only=graphene.Boolean())
    cloth_colors = graphene.List(ClothColorType, active_only=graphene.Boolean())
    item_types = graphene.List(ItemTypeType, active_only=graphene.Boolean())
    warehouse_locations = graphene.List(WarehouseLocationType)

    # People
    employee_profile = graphene.Field(EmployeeProfileType)
    employees = graphene.List(EmployeeProfileType)

    # Suppliers & buyers
    suppliers = graphene.List(SupplierType, search=graphene.String(), supply_type=graphene.String())
    buyers = graphene.List(BuyerType, search=graphene.String(), buyer_type=graphene.String())

    # Inventory
    purchase_orders = graphene.List(PurchaseOrderType, status=graphene.String(), limit=graphene.Int())
    expenses = graphene.List(ExpenseType, limit=graphene.Int())
    purchase_bills = graphene.List(PurchaseBillType, limit=graphene.Int())
    raw_cloth_batches = graphene.List(RawClothBatchType, category_id=graphene.ID(), color_id=graphene.ID(), warehouse_id=graphene.ID())
    readymade_stock = graphene.List(ReadymadeStockType, item_type_id=graphene.ID(), warehouse_id=graphene.ID())

    # Production
    cutting_assignments = graphene.List(CuttingAssignmentType, status=graphene.String(), master_id=graphene.ID(), limit=graphene.Int())
    stitching_jobs = graphene.List(StitchingJobType, status=graphene.String(), tailor_id=graphene.ID(), limit=graphene.Int())

    # Finished goods
    finished_products = graphene.List(FinishedProductType, item_type_id=graphene.ID(), search=graphene.String(), untagged_only=graphene.Boolean(), warehouse_id=graphene.ID())

    # Sales
    sales_orders = graphene.List(SalesOrderType, status=graphene.String(), buyer_id=graphene.ID(), limit=graphene.Int())
    credit_transactions = graphene.List(CreditTransactionType, buyer_id=graphene.ID(), status=graphene.String(), limit=graphene.Int())

    # Returns
    buyer_returns = graphene.List(BuyerReturnType)
    supplier_returns = graphene.List(SupplierReturnType)

    product_by_barcode = graphene.Field(FinishedProductType, barcode=graphene.String(required=True))

    # Misc
    notifications = graphene.List(NotificationType, unread_only=graphene.Boolean())
    unread_notification_count = graphene.Int()
    audit_logs = graphene.List(AuditLogType, entity_type=graphene.String(required=True), entity_id=graphene.ID(required=True))
    all_audit_logs = graphene.List(AuditLogType, entity_type=graphene.String(), actor_name=graphene.String(), limit=graphene.Int())
    analytics_stats = graphene.Field(AnalyticsStats)
    dashboard_stats = graphene.Field(DashboardStats)

    # ── resolvers ─────────────────────────────────────────────────────────────

    @login_required
    def resolve_system_settings(self, info):
        return selectors.get_system_settings()

    @login_required
    def resolve_cloth_categories(self, info, active_only=True):
        return selectors.get_cloth_categories(active_only)

    @login_required
    def resolve_cloth_colors(self, info, active_only=True):
        return selectors.get_cloth_colors(active_only)

    @login_required
    def resolve_item_types(self, info, active_only=True):
        return selectors.get_item_types(active_only)

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
    def resolve_suppliers(self, info, search=None, supply_type=None):
        return selectors.get_suppliers(search=search, supply_type=supply_type)

    @login_required
    def resolve_buyers(self, info, search=None, buyer_type=None):
        return selectors.get_buyers(search=search, buyer_type=buyer_type)

    @login_required
    def resolve_purchase_orders(self, info, status=None, limit=50):
        return selectors.get_purchase_orders(info.context.user, status=status, limit=limit)

    @login_required
    def resolve_expenses(self, info, limit=200):
        return selectors.get_expenses(info.context.user, limit=limit)

    def resolve_purchase_bills(self, info, limit=50):
        return selectors.get_purchase_bills(info.context.user, limit=limit)

    @login_required
    def resolve_raw_cloth_batches(self, info, category_id=None, color_id=None, warehouse_id=None):
        return selectors.get_raw_cloth_batches(info.context.user, category_id=category_id, color_id=color_id, warehouse_id=warehouse_id)

    @login_required
    def resolve_readymade_stock(self, info, item_type_id=None, warehouse_id=None):
        return selectors.get_readymade_stock(info.context.user, item_type_id=item_type_id, warehouse_id=warehouse_id)

    @login_required
    def resolve_cutting_assignments(self, info, status=None, master_id=None, limit=100):
        return selectors.get_cutting_assignments(info.context.user, status=status, master_id=master_id, limit=limit)

    @login_required
    def resolve_stitching_jobs(self, info, status=None, tailor_id=None, limit=100):
        return selectors.get_stitching_jobs(info.context.user, status=status, tailor_id=tailor_id, limit=limit)

    @login_required
    def resolve_finished_products(self, info, item_type_id=None, search=None, untagged_only=False, warehouse_id=None):
        return selectors.get_finished_products(info.context.user, item_type_id=item_type_id, search=search, untagged_only=untagged_only, warehouse_id=warehouse_id)

    @login_required
    def resolve_sales_orders(self, info, status=None, buyer_id=None, limit=50):
        return selectors.get_sales_orders(info.context.user, status=status, buyer_id=buyer_id, limit=limit)

    @login_required
    def resolve_credit_transactions(self, info, buyer_id=None, status=None, limit=50):
        return selectors.get_credit_transactions(info.context.user, buyer_id=buyer_id, status=status, limit=limit)

    @login_required
    def resolve_buyer_returns(self, info):
        return selectors.get_buyer_returns(info.context.user)

    @login_required
    def resolve_supplier_returns(self, info):
        return selectors.get_supplier_returns(info.context.user)

    @login_required
    def resolve_notifications(self, info, unread_only=False):
        return selectors.get_notifications(info.context.user, unread_only)

    @login_required
    def resolve_unread_notification_count(self, info):
        return selectors.get_unread_notification_count(info.context.user)

    @login_required
    def resolve_audit_logs(self, info, entity_type, entity_id):
        return selectors.get_audit_logs(entity_type=entity_type, entity_id=str(entity_id))

    @login_required
    def resolve_all_audit_logs(self, info, entity_type="", actor_name="", limit=200):
        from warehouse.permissions import get_profile
        from warehouse.models import EmployeeProfile
        profile = get_profile(info.context.user)
        allowed = {EmployeeProfile.Role.SUPER_ADMIN, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.AUDITOR}
        if profile.role not in allowed:
            return []
        return selectors.get_all_audit_logs(entity_type=entity_type, actor_name=actor_name, limit=limit)

    @login_required
    def resolve_product_by_barcode(self, info, barcode):
        from warehouse.models import FinishedProduct
        return FinishedProduct.objects.filter(barcode=barcode).select_related("item_type", "cloth_color", "cloth_category", "warehouse").first()

    @login_required
    def resolve_analytics_stats(self, info):
        return selectors.get_analytics_stats(info.context.user)

    @login_required
    def resolve_dashboard_stats(self, info):
        return selectors.get_dashboard_stats(info.context.user)
