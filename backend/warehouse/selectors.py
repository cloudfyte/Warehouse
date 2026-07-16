"""Read-only query functions — called by GraphQL resolvers. No writes here."""
from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from .models import (
    AuditLog,
    Buyer,
    BuyerReturn,
    ClothCategory,
    ClothColor,
    CreditTransaction,
    CuttingAssignment,
    FinishedProduct,
    ItemType,
    Notification,
    PurchaseBill,
    PurchaseOrder,
    RawClothBatch,
    ReadymadeStock,
    Expense,
    SalesOrder,
    SalesOrderItem,
    StitchingJob,
    StockAdjustment,
    Supplier,
    SupplierPayment,
    SupplierReturn,
    SystemSettings,
    WarehouseLocation,
    EmployeeProfile,
)
from .permissions import ELEVATED_ROLES, MANAGEMENT_ROLES, accessible_warehouses, get_profile


# ─── master data ──────────────────────────────────────────────────────────────

def get_system_settings():
    return SystemSettings.load()


def get_cloth_categories(active_only=True):
    qs = ClothCategory.objects.all()
    return qs.filter(active=True) if active_only else qs


def get_cloth_colors(active_only=True):
    qs = ClothColor.objects.all()
    return qs.filter(active=True) if active_only else qs


def get_item_types(active_only=True):
    qs = ItemType.objects.all()
    return qs.filter(active=True) if active_only else qs


def get_warehouse_locations(user):
    profile = get_profile(user)
    if profile.role in ELEVATED_ROLES:
        return WarehouseLocation.objects.order_by("name")
    return profile.locations.filter(active=True)


# ─── people ───────────────────────────────────────────────────────────────────

def get_employee_profile(user):
    return get_profile(user)


def get_employees(user):
    profile = get_profile(user)
    if profile.role not in MANAGEMENT_ROLES:
        return EmployeeProfile.objects.none()
    qs = EmployeeProfile.objects.select_related("user").prefetch_related("locations").order_by("user__username")
    if profile.role == EmployeeProfile.Role.MANAGER:
        qs = qs.filter(locations__in=accessible_warehouses(user)).distinct()
    return qs


# ─── suppliers & buyers ───────────────────────────────────────────────────────

def get_suppliers(search=None, supply_type=None):
    qs = Supplier.objects.filter(active=True)
    if supply_type:
        qs = qs.filter(Q(supply_type=supply_type) | Q(supply_type="BOTH"))
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(contact_person__icontains=search))
    return qs


def get_buyers(search=None, buyer_type=None):
    qs = Buyer.objects.filter(active=True)
    if buyer_type:
        qs = qs.filter(buyer_type=buyer_type)
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(contact_person__icontains=search))
    return qs


# ─── purchase orders (inbound) ────────────────────────────────────────────────

def get_purchase_orders(user, status=None, limit=50):
    profile = get_profile(user)
    if profile.role not in MANAGEMENT_ROLES:
        return PurchaseOrder.objects.none()
    qs = (
        PurchaseOrder.objects
        .select_related("supplier", "warehouse", "created_by")
        .prefetch_related("items")
        .filter(warehouse__in=accessible_warehouses(user))
    )
    if status:
        qs = qs.filter(status=status)
    return qs[: min(limit, 200)]


def get_purchase_order(user, po_id):
    return (
        PurchaseOrder.objects
        .select_related("supplier", "warehouse")
        .prefetch_related("items__cloth_category", "items__cloth_color", "items__item_type")
        .get(pk=po_id, warehouse__in=accessible_warehouses(user))
    )


# ─── purchase bills (direct walk-in purchases) ────────────────────────────────

def get_purchase_bills(user, limit=50):
    profile = get_profile(user)
    if profile.role not in MANAGEMENT_ROLES:
        return PurchaseBill.objects.none()
    return (
        PurchaseBill.objects
        .select_related("supplier", "warehouse", "created_by")
        .prefetch_related(
            "items__cloth_category", "items__cloth_color", "items__item_type",
        )
        .filter(warehouse__in=accessible_warehouses(user))
    )[: min(limit, 200)]


# ─── inventory ────────────────────────────────────────────────────────────────

def get_raw_cloth_batches(user, category_id=None, color_id=None, warehouse_id=None):
    qs = (
        RawClothBatch.objects
        .select_related("cloth_category", "cloth_color", "warehouse", "supplier")
        .filter(active=True, warehouse__in=accessible_warehouses(user))
    )
    if category_id:
        qs = qs.filter(cloth_category_id=category_id)
    if color_id:
        qs = qs.filter(cloth_color_id=color_id)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    return qs


def get_readymade_stock(user, item_type_id=None, warehouse_id=None):
    qs = (
        ReadymadeStock.objects
        .select_related("item_type", "cloth_color", "warehouse", "supplier")
        .filter(warehouse__in=accessible_warehouses(user))
    )
    if item_type_id:
        qs = qs.filter(item_type_id=item_type_id)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    return qs


# ─── production pipeline ──────────────────────────────────────────────────────

def get_cutting_assignments(user, status=None, master_id=None, limit=100):
    profile = get_profile(user)
    qs = (
        CuttingAssignment.objects
        .select_related("raw_cloth_batch", "cutting_master__user", "item_type", "assigned_by")
        .filter(raw_cloth_batch__warehouse__in=accessible_warehouses(user))
    )
    if profile.role == EmployeeProfile.Role.CUTTING_MASTER:
        qs = qs.filter(cutting_master=profile)
    elif master_id:
        qs = qs.filter(cutting_master_id=master_id)
    if status:
        qs = qs.filter(status=status)
    return qs[: min(limit, 200)]


def get_stitching_jobs(user, status=None, tailor_id=None, limit=100):
    profile = get_profile(user)
    qs = (
        StitchingJob.objects
        .select_related("cutting_assignment__item_type", "tailor__user", "assigned_by")
        .filter(cutting_assignment__raw_cloth_batch__warehouse__in=accessible_warehouses(user))
    )
    if profile.role == EmployeeProfile.Role.TAILOR:
        qs = qs.filter(tailor=profile)
    elif tailor_id:
        qs = qs.filter(tailor_id=tailor_id)
    if status:
        qs = qs.filter(status=status)
    return qs[: min(limit, 200)]


# ─── finished products ────────────────────────────────────────────────────────

def get_finished_products(user, item_type_id=None, search=None, untagged_only=False, warehouse_id=None):
    qs = (
        FinishedProduct.objects
        .select_related("item_type", "cloth_category", "cloth_color", "warehouse")
        .filter(active=True, warehouse__in=accessible_warehouses(user))
    )
    if item_type_id:
        qs = qs.filter(item_type_id=item_type_id)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if untagged_only:
        qs = qs.filter(tags_printed=False)
    if search:
        qs = qs.filter(Q(sku__icontains=search) | Q(item_type__name__icontains=search) | Q(barcode__icontains=search))
    return qs


# ─── sales orders ─────────────────────────────────────────────────────────────

def get_sales_orders(user, status=None, buyer_id=None, limit=50):
    profile = get_profile(user)
    if profile.role not in MANAGEMENT_ROLES:
        return SalesOrder.objects.none()
    qs = (
        SalesOrder.objects
        .select_related("buyer", "warehouse", "created_by")
        .prefetch_related("items__finished_product")
        .filter(warehouse__in=accessible_warehouses(user))
    )
    if status:
        qs = qs.filter(status=status)
    if buyer_id:
        qs = qs.filter(buyer_id=buyer_id)
    return qs[: min(limit, 200)]


# ─── credit ───────────────────────────────────────────────────────────────────

def get_credit_transactions(user, buyer_id=None, status=None, limit=50):
    profile = get_profile(user)
    if profile.role not in MANAGEMENT_ROLES:
        return CreditTransaction.objects.none()
    qs = (
        CreditTransaction.objects
        .select_related("buyer", "sales_order")
        .prefetch_related("payments")
        .filter(sales_order__warehouse__in=accessible_warehouses(user))
    )
    if buyer_id:
        qs = qs.filter(buyer_id=buyer_id)
    if status:
        qs = qs.filter(status=status)
    return qs[: min(limit, 200)]


# ─── notifications ────────────────────────────────────────────────────────────

def get_notifications(user, unread_only=False):
    qs = Notification.objects.filter(recipient=user)
    return qs.filter(read=False) if unread_only else qs[:100]


# ─── supplier payments ────────────────────────────────────────────────────────

def get_supplier_payments(*, bill_id):
    return (
        SupplierPayment.objects
        .filter(bill_id=bill_id)
        .select_related("created_by")
        .order_by("-payment_date", "-created_at")
    )


# ─── stock adjustments ────────────────────────────────────────────────────────

def get_stock_adjustments(user, warehouse_id=None, limit=200):
    qs = (
        StockAdjustment.objects
        .select_related(
            "raw_cloth_batch__cloth_category", "raw_cloth_batch__cloth_color",
            "finished_product__item_type",
            "warehouse", "created_by"
        )
        .filter(warehouse__in=accessible_warehouses(user))
    )
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    return qs[:limit]


# ─── analytics dashboard ──────────────────────────────────────────────────────

def get_dashboard_stats(user):
    from .schema.types import DashboardStats
    warehouses = accessible_warehouses(user)

    raw_cloth = RawClothBatch.objects.filter(active=True, warehouse__in=warehouses)
    finished = FinishedProduct.objects.filter(active=True, warehouse__in=warehouses)
    sales = SalesOrder.objects.filter(warehouse__in=warehouses)
    credit = CreditTransaction.objects.filter(sales_order__warehouse__in=warehouses)
    cutting = CuttingAssignment.objects.filter(raw_cloth_batch__warehouse__in=warehouses)
    stitching = StitchingJob.objects.filter(cutting_assignment__raw_cloth_batch__warehouse__in=warehouses)
    bills = PurchaseBill.objects.filter(warehouse__in=warehouses)

    today = timezone.now().date()
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)

    total_raw_meters = raw_cloth.aggregate(t=Sum("available_meters"))["t"] or 0
    total_finished_pieces = finished.aggregate(t=Sum("quantity"))["t"] or 0
    readymade_pieces = finished.filter(source="IMPORTED").aggregate(t=Sum("quantity"))["t"] or 0
    inhouse_pieces = finished.filter(source="IN_HOUSE").aggregate(t=Sum("quantity"))["t"] or 0

    revenue_month = (
        SalesOrderItem.objects
        .filter(sales_order__warehouse__in=warehouses, sales_order__created_at__date__gte=month_start,
                sales_order__status__in=["DISPATCHED", "DELIVERED"])
        .aggregate(t=Sum("total_price"))["t"] or 0
    )
    revenue_year = (
        SalesOrderItem.objects
        .filter(sales_order__warehouse__in=warehouses, sales_order__created_at__date__gte=year_start,
                sales_order__status__in=["DISPATCHED", "DELIVERED"])
        .aggregate(t=Sum("total_price"))["t"] or 0
    )
    credit_outstanding = (
        credit.filter(status__in=["OUTSTANDING", "PARTIAL", "OVERDUE"])
        .aggregate(t=Sum("amount_due"))["t"] or 0
    )

    # Supplier payment stats (purchase bills)
    bill_agg = bills.aggregate(
        total=Sum("total_amount"),
        paid=Sum("amount_paid"),
    )
    supplier_total = float(bill_agg["total"] or 0)
    supplier_paid = float(bill_agg["paid"] or 0)
    supplier_pending = supplier_total - supplier_paid

    # Buyer credit breakdown
    credit_received = float(credit.aggregate(t=Sum("amount_paid"))["t"] or 0)
    credit_overdue = float(
        credit.filter(status="OVERDUE").aggregate(t=Sum("amount_due"))["t"] or 0
    )
    credit_settled = float(
        credit.filter(status="SETTLED").aggregate(t=Sum("total_amount"))["t"] or 0
    )

    # Expense totals
    expenses = Expense.objects.filter(warehouse__in=warehouses)
    expenses_month = float(expenses.filter(expense_date__gte=month_start).aggregate(t=Sum("amount"))["t"] or 0)
    expenses_year  = float(expenses.filter(expense_date__gte=year_start).aggregate(t=Sum("amount"))["t"] or 0)

    return DashboardStats(
        total_raw_meters=float(total_raw_meters),
        total_finished_pieces=total_finished_pieces,
        readymade_pieces=readymade_pieces,
        inhouse_pieces=inhouse_pieces,
        active_purchase_orders=PurchaseOrder.objects.filter(
            warehouse__in=warehouses, status__in=["PLACED", "DISPATCHED"]
        ).count(),
        active_sales_orders=sales.filter(status__in=["REQUESTED", "PROCESSING", "READY"]).count(),
        cutting_in_progress=cutting.filter(status__in=["PENDING", "IN_PROGRESS"]).count(),
        stitching_in_progress=stitching.filter(status__in=["RECEIVED", "PROCESSING", "QC_CHECK"]).count(),
        credit_outstanding=float(credit_outstanding),
        revenue_this_month=float(revenue_month),
        revenue_this_year=float(revenue_year),
        total_suppliers=Supplier.objects.filter(active=True).count(),
        total_buyers=Buyer.objects.filter(active=True).count(),
        supplier_total_purchased=supplier_total,
        supplier_total_paid=supplier_paid,
        supplier_total_pending=supplier_pending,
        credit_received=credit_received,
        credit_overdue=credit_overdue,
        credit_settled=credit_settled,
        expenses_this_month=expenses_month,
        expenses_this_year=expenses_year,
    )


def get_buyer_returns(user):
    return BuyerReturn.objects.select_related(
        "buyer", "finished_product", "finished_product__item_type", "warehouse"
    ).order_by("-created_at")


def get_supplier_returns(user):
    return SupplierReturn.objects.select_related(
        "supplier", "raw_cloth_batch", "readymade_stock", "warehouse"
    ).order_by("-created_at")


def get_expenses(user, limit=200):
    warehouses = accessible_warehouses(user)
    return (
        Expense.objects.filter(warehouse__in=warehouses)
        .select_related("warehouse", "created_by")
        .order_by("-expense_date", "-created_at")[:limit]
    )


# ─── notifications ────────────────────────────────────────────────────────────

def get_unread_notification_count(user) -> int:
    return Notification.objects.filter(recipient=user, read=False).count()


# ─── audit log ────────────────────────────────────────────────────────────────

def get_audit_logs(*, entity_type: str, entity_id: str):
    return AuditLog.objects.filter(entity_type=entity_type, entity_id=entity_id).select_related("actor")[:100]


def get_all_audit_logs(*, entity_type: str = "", actor_name: str = "", limit: int = 200):
    qs = AuditLog.objects.select_related("actor")
    if entity_type:
        qs = qs.filter(entity_type__iexact=entity_type)
    if actor_name:
        qs = qs.filter(actor_name__icontains=actor_name)
    return qs[:limit]


# ─── analytics ────────────────────────────────────────────────────────────────

def get_analytics_stats(user):
    """Return analytics data for the last 12 months."""
    from django.db.models.functions import TruncMonth
    from decimal import Decimal
    from warehouse.schema.types import (
        AnalyticsStats, MonthlyRevenueStat, MonthlyProductionStat,
        RevenueExpenseStat, StockCategoryStat, TopBuyerStat, TopSupplierStat,
    )

    warehouses = accessible_warehouses(user)
    cutoff = timezone.now() - timezone.timedelta(days=365)

    # Monthly revenue (last 12 months)
    monthly_qs = (
        SalesOrder.objects
        .filter(warehouse__in=warehouses, status="DELIVERED", order_date__gte=cutoff)
        .annotate(month=TruncMonth("order_date"))
        .values("month")
        .annotate(revenue=Sum("total_amount"), order_count=Count("id"))
        .order_by("month")
    )
    monthly_revenue = [
        MonthlyRevenueStat(
            month=row["month"].strftime("%b %Y"),
            revenue=float(row["revenue"] or 0),
            order_count=row["order_count"],
        )
        for row in monthly_qs
    ]

    # Monthly production (pieces cut/stitched per month)
    cut_qs = (
        CuttingAssignment.objects
        .filter(raw_cloth_batch__warehouse__in=warehouses, assigned_date__gte=cutoff)
        .annotate(month=TruncMonth("assigned_date"))
        .values("month")
        .annotate(pieces=Sum("pieces_completed"), wasted=Sum("cloth_wasted"))
        .order_by("month")
    )
    stitch_qs = (
        StitchingJob.objects
        .filter(
            cutting_assignment__raw_cloth_batch__warehouse__in=warehouses,
            assigned_date__gte=cutoff
        )
        .annotate(month=TruncMonth("assigned_date"))
        .values("month")
        .annotate(pieces=Sum("pieces_completed"))
        .order_by("month")
    )
    cut_map = {row["month"]: (int(row["pieces"] or 0), float(row["wasted"] or 0)) for row in cut_qs}
    stitch_map = {row["month"]: int(row["pieces"] or 0) for row in stitch_qs}
    all_prod_months = sorted(set(cut_map) | set(stitch_map))
    monthly_production = [
        MonthlyProductionStat(
            month=m.strftime("%b %Y"),
            pieces_cut=cut_map.get(m, (0, 0))[0],
            pieces_stitched=stitch_map.get(m, 0),
            cloth_wasted=cut_map.get(m, (0, 0.0))[1],
        )
        for m in all_prod_months
    ]

    # Cloth wastage percentage (all time)
    cutting_totals = CuttingAssignment.objects.filter(
        raw_cloth_batch__warehouse__in=warehouses
    ).aggregate(used=Sum("cloth_used"), wasted=Sum("cloth_wasted"))
    total_used = float(cutting_totals["used"] or 0)
    total_wasted = float(cutting_totals["wasted"] or 0)
    cloth_wastage_pct = round((total_wasted / total_used * 100) if total_used > 0 else 0.0, 2)

    # Revenue vs Expenses monthly comparison
    expense_qs = (
        Expense.objects
        .filter(warehouse__in=warehouses, expense_date__gte=cutoff)
        .annotate(month=TruncMonth("expense_date"))
        .values("month")
        .annotate(total=Sum("amount"))
        .order_by("month")
    )
    rev_map = {row["month"].strftime("%b %Y"): float(row["revenue"] or 0) for row in monthly_qs}
    exp_map = {row["month"].strftime("%b %Y"): float(row["total"] or 0) for row in expense_qs}
    all_months = sorted(set(rev_map) | set(exp_map))
    revenue_vs_expenses = [
        RevenueExpenseStat(
            month=m,
            revenue=rev_map.get(m, 0.0),
            expenses=exp_map.get(m, 0.0),
        )
        for m in all_months
    ]

    # Stock by category
    cloth_qs = (
        RawClothBatch.objects
        .filter(warehouse__in=warehouses, available_meters__gt=0)
        .select_related("cloth_category")
    )
    cat_map: dict[str, float] = {}
    for b in cloth_qs:
        cat_map[b.cloth_category.name] = cat_map.get(b.cloth_category.name, 0) + float(b.available_meters)

    rmd_qs = (
        ReadymadeStock.objects
        .filter(warehouse__in=warehouses, quantity_available__gt=0)
        .select_related("item_type")
    )
    pcs_map: dict[str, int] = {}
    for r in rmd_qs:
        pcs_map[r.item_type.name] = pcs_map.get(r.item_type.name, 0) + r.quantity_available

    all_cats = set(cat_map) | set(pcs_map)
    stock_by_category = [
        StockCategoryStat(category=c, meters=cat_map.get(c, 0), pieces=pcs_map.get(c, 0))
        for c in sorted(all_cats)
    ]

    # Top buyers (last 12 months)
    top_qs = (
        SalesOrder.objects
        .filter(warehouse__in=warehouses, status="DELIVERED", order_date__gte=cutoff)
        .values("buyer__name")
        .annotate(total_spend=Sum("total_amount"), order_count=Count("id"))
        .order_by("-total_spend")[:8]
    )
    top_buyers = [
        TopBuyerStat(
            buyer_name=row["buyer__name"],
            total_spend=float(row["total_spend"] or 0),
            order_count=row["order_count"],
        )
        for row in top_qs
    ]

    # Top suppliers by purchase bill value
    from warehouse.models import PurchaseBill
    supplier_qs = (
        PurchaseBill.objects
        .filter(warehouse__in=warehouses)
        .values("supplier__name")
        .annotate(
            total_purchased=Sum("total_amount"),
            total_paid=Sum("amount_paid"),
        )
        .order_by("-total_purchased")[:8]
    )
    top_suppliers = [
        TopSupplierStat(
            supplier_name=row["supplier__name"],
            total_purchased=float(row["total_purchased"] or 0),
            total_paid=float(row["total_paid"] or 0),
            total_pending=float((row["total_purchased"] or 0) - (row["total_paid"] or 0)),
        )
        for row in supplier_qs
    ]

    supplier_total_pending = sum(s.total_pending for s in top_suppliers)

    return AnalyticsStats(
        monthly_revenue=monthly_revenue,
        monthly_production=monthly_production,
        revenue_vs_expenses=revenue_vs_expenses,
        stock_by_category=stock_by_category,
        top_buyers=top_buyers,
        top_suppliers=top_suppliers,
        cloth_wastage_pct=cloth_wastage_pct,
        supplier_total_pending=supplier_total_pending,
    )
