import graphene
from graphql_jwt.decorators import login_required

from warehouse import selectors

from .types import (
    AgingReport, AnalyticsStats, AuditLogType, BuyerReturnType, BuyerType, ClothCategoryType,
    ClothColorType, CreditTransactionType, CustomRoleType, CuttingAssignmentType,
    DashboardStats, EmployeeProfileType, ExpenseType, FinishedProductType, ItemTypeType,
    NotificationType, PLReport, ParcelInspectionType, ProductSetType, PublicSettingsType,
    PurchaseBillType, PurchaseOrderType, QuotationType, RawClothBatchType, ReadymadeStockType,
    ReconciliationRowType, RecurringSettlementType, ReorderPointType, RetailChannelType,
    RetailDispatchType, RetailReturnType, RetailStoreType, SalesOrderType, SettlementType,
    StitchingJobType, StockAdjustmentType, StockTransferType, SupplierPaymentType,
    SupplierReturnType, SupplierType, SystemSettingsType, WarehouseLocationType,
)


class Query(graphene.ObjectType):
    # Public
    system_settings = graphene.Field(SystemSettingsType)
    # Deliberately not login_required — the login screen needs branding.
    public_settings = graphene.Field(PublicSettingsType)

    # Master data
    cloth_categories = graphene.List(ClothCategoryType, active_only=graphene.Boolean())
    cloth_colors = graphene.List(ClothColorType, active_only=graphene.Boolean())
    item_types = graphene.List(ItemTypeType, active_only=graphene.Boolean())
    warehouse_locations = graphene.List(WarehouseLocationType)

    # People
    employee_profile = graphene.Field(EmployeeProfileType)
    employees = graphene.List(EmployeeProfileType)
    custom_roles = graphene.List(CustomRoleType)

    # Suppliers & buyers
    suppliers = graphene.List(SupplierType, search=graphene.String(), supply_type=graphene.String(), include_archived=graphene.Boolean())
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

    # Stock adjustments
    stock_adjustments = graphene.List(StockAdjustmentType, warehouse_id=graphene.ID(), limit=graphene.Int())

    # Supplier payments for a specific bill
    supplier_payments = graphene.List(SupplierPaymentType, bill_id=graphene.ID(required=True))

    product_by_barcode = graphene.Field(FinishedProductType, barcode=graphene.String(required=True))

    # Misc
    notifications = graphene.List(NotificationType, unread_only=graphene.Boolean())
    unread_notification_count = graphene.Int()
    audit_logs = graphene.List(AuditLogType, entity_type=graphene.String(required=True), entity_id=graphene.ID(required=True))
    all_audit_logs = graphene.List(AuditLogType, entity_type=graphene.String(), actor_name=graphene.String(), limit=graphene.Int())
    analytics_stats = graphene.Field(AnalyticsStats)
    dashboard_stats = graphene.Field(DashboardStats)

    # Reorder points
    reorder_points = graphene.List(ReorderPointType, active_only=graphene.Boolean())

    # Monthly settlements
    product_sets = graphene.List(ProductSetType, active_only=graphene.Boolean())
    settlements = graphene.List(SettlementType, status=graphene.String(), period=graphene.Date())
    recurring_settlements = graphene.List(RecurringSettlementType, active_only=graphene.Boolean())

    # Stock transfers
    stock_transfers = graphene.List(StockTransferType, status=graphene.String(), limit=graphene.Int())
    retail_channel = graphene.Field(RetailChannelType)
    retail_stores = graphene.List(RetailStoreType)
    retail_dispatches = graphene.List(RetailDispatchType, status=graphene.String(), limit=graphene.Int())
    retail_returns = graphene.List(RetailReturnType, limit=graphene.Int())
    retail_reconciliation = graphene.List(ReconciliationRowType, store_id=graphene.ID(required=True))
    unlinked_finished_products = graphene.List(FinishedProductType)

    # Parcel inspection
    parcel_inspection = graphene.Field(ParcelInspectionType, po_id=graphene.ID(required=True))

    # Quotations
    quotations = graphene.List(QuotationType, limit=graphene.Int())

    # Reports (on-demand — not in DASHBOARD_QUERY)
    profit_loss_report = graphene.Field(PLReport, year=graphene.Int(required=True), month=graphene.Int())
    aging_report = graphene.Field(AgingReport)

    # ── resolvers ─────────────────────────────────────────────────────────────

    @login_required
    def resolve_system_settings(self, info):
        return selectors.get_system_settings()

    def resolve_public_settings(self, info):
        from warehouse.schema.types import to_url
        cfg = selectors.get_system_settings()
        return PublicSettingsType(
            app_name=cfg.app_name,
            app_subtitle=cfg.app_subtitle,
            logo_url=to_url(cfg.logo_url),
            primary_color=cfg.primary_color,
            accent_color=cfg.accent_color,
            default_dark_mode=cfg.default_dark_mode,
            company_name=cfg.company_name,
        )

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
    def resolve_custom_roles(self, info):
        from warehouse.models import CustomRole, EmployeeProfile
        from warehouse.permissions import require_role
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CustomRole.objects.all()

    @login_required
    def resolve_suppliers(self, info, search=None, supply_type=None, include_archived=False):
        return selectors.get_suppliers(search=search, supply_type=supply_type, include_archived=include_archived)

    @login_required
    def resolve_buyers(self, info, search=None, buyer_type=None):
        return selectors.get_buyers(search=search, buyer_type=buyer_type)

    @login_required
    def resolve_purchase_orders(self, info, status=None, limit=50):
        return selectors.get_purchase_orders(info.context.user, status=status, limit=limit)

    @login_required
    def resolve_expenses(self, info, limit=200):
        return selectors.get_expenses(info.context.user, limit=limit)

    @login_required
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
    def resolve_stock_adjustments(self, info, warehouse_id=None, limit=200):
        return selectors.get_stock_adjustments(info.context.user, warehouse_id=warehouse_id, limit=limit)

    @login_required
    def resolve_supplier_payments(self, info, bill_id):
        return selectors.get_supplier_payments(bill_id=bill_id)

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
        """
        Find a product by any code it has ever carried.

        Repricing mints a new barcode, because the price is inside the code — so
        a scan of a tag printed before the last price change still has to land on
        the right product rather than nothing at all.
        """
        from django.db.models import Q

        from warehouse.models import FinishedProduct
        from warehouse.permissions import accessible_warehouses

        barcode = (barcode or "").strip()
        if not barcode:
            return None

        matches = (FinishedProduct.objects
                   .filter(warehouse__in=accessible_warehouses(info.context.user))
                   .filter(Q(barcode=barcode) | Q(previous_barcodes__contains=barcode))
                   .select_related("item_type", "cloth_color", "cloth_category", "warehouse"))

        for product in matches:
            # __contains can match a code that merely sits inside another, so the
            # retired codes are compared as whole entries.
            if product.barcode == barcode or barcode in product.past_codes():
                return product
        return None

    @login_required
    def resolve_analytics_stats(self, info):
        return selectors.get_analytics_stats(info.context.user)

    @login_required
    def resolve_dashboard_stats(self, info):
        return selectors.get_dashboard_stats(info.context.user)

    @login_required
    def resolve_reorder_points(self, info, active_only=False):
        return selectors.get_reorder_points(info.context.user, active_only=active_only)

    @login_required
    def resolve_product_sets(self, info, active_only=False):
        return selectors.get_product_sets(info.context.user, active_only=active_only)

    @login_required
    def resolve_settlements(self, info, status=None, period=None):
        return selectors.get_settlements(info.context.user, status=status, period=period)

    @login_required
    def resolve_recurring_settlements(self, info, active_only=False):
        return selectors.get_recurring_settlements(info.context.user, active_only=active_only)

    @login_required
    def resolve_stock_transfers(self, info, status=None, limit=100):
        return selectors.get_stock_transfers(info.context.user, status=status, limit=limit)

    @login_required
    def resolve_retail_channel(self, info):
        return selectors.get_retail_channel(info.context.user)

    @login_required
    def resolve_retail_stores(self, info):
        return selectors.get_retail_stores(info.context.user)

    @login_required
    def resolve_retail_dispatches(self, info, status=None, limit=100):
        return selectors.get_retail_dispatches(info.context.user, status=status, limit=limit)

    @login_required
    def resolve_retail_returns(self, info, limit=100):
        return selectors.get_retail_returns(info.context.user, limit=limit)

    @login_required
    def resolve_retail_reconciliation(self, info, store_id):
        from warehouse.services.retail import reconcile

        return reconcile(user=info.context.user, store_id=store_id)

    @login_required
    def resolve_unlinked_finished_products(self, info):
        return selectors.get_unlinked_finished_products(info.context.user)

    @login_required
    def resolve_parcel_inspection(self, info, po_id):
        return selectors.get_parcel_inspection(po_id)

    @login_required
    def resolve_quotations(self, info, limit=100):
        return selectors.get_quotations(info.context.user, limit=limit)

    @login_required
    def resolve_profit_loss_report(self, info, year, month=None):
        return selectors.get_profit_loss_report(info.context.user, year=year, month=month)

    @login_required
    def resolve_aging_report(self, info):
        return selectors.get_aging_report(info.context.user)
