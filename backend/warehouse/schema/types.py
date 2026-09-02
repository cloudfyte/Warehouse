import graphene
from graphene_django import DjangoObjectType

# Installs the DecimalField->Float and JSONField->GenericScalar conversions.
# Must be imported before the DjangoObjectType classes below are declared.
from warehouse.schema import converters  # noqa: F401

from warehouse.permissions import ELEVATED_ROLES
from warehouse.services.uploads import to_url, to_urls_csv
from warehouse.models import (
    AuditLog,
    Buyer,
    CustomRole,
    Expense,
    BuyerReturn,
    ClothCategory,
    ClothColor,
    CreditPayment,
    CreditTransaction,
    CuttingAssignment,
    EmployeeProfile,
    FinishedProduct,
    ProductSet,
    ProductSetItem,
    RecurringSettlement,
    Settlement,
    FinishedProductOption,
    ItemType,
    Notification,
    OTPCode,
    ParcelInspection,
    PurchaseBill,
    PurchaseBillItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    QuotationItem,
    RawClothBatch,
    ReadymadeStock,
    ReorderPoint,
    SalesOrder,
    SalesOrderItem,
    StitchingJob,
    StockAdjustment,
    StockTransfer,
    Supplier,
    SupplierPayment,
    SupplierReturn,
    SystemSettings,
    WarehouseLocation,
)


class WarehouseLocationType(DjangoObjectType):
    class Meta:
        model = WarehouseLocation
        fields = "__all__"


class CustomRoleType(DjangoObjectType):
    class Meta:
        model = CustomRole
        fields = "__all__"


class EmployeeProfileType(DjangoObjectType):
    username = graphene.String()
    email = graphene.String()
    custom_role = graphene.Field(CustomRoleType)

    class Meta:
        model = EmployeeProfile
        fields = ("id", "role", "phone", "locations", "active", "created_at", "custom_role")

    def resolve_username(self, info):
        return self.user.username

    def resolve_email(self, info):
        return self.user.email

    def resolve_custom_role(self, info):
        return self.custom_role


class ClothCategoryType(DjangoObjectType):
    class Meta:
        model = ClothCategory
        fields = "__all__"


class ClothColorType(DjangoObjectType):
    class Meta:
        model = ClothColor
        fields = "__all__"


class ItemTypeType(DjangoObjectType):
    gst_rate = graphene.Float()

    class Meta:
        model = ItemType
        fields = "__all__"

    def resolve_gst_rate(self, info):
        return float(self.gst_rate)


class SupplierType(DjangoObjectType):
    class Meta:
        model = Supplier
        fields = "__all__"


class BuyerType(DjangoObjectType):
    class Meta:
        model = Buyer
        fields = "__all__"


class RecurringSettlementType(DjangoObjectType):
    amount = graphene.Float()

    class Meta:
        model = RecurringSettlement
        fields = "__all__"

    def resolve_amount(self, info):
        return float(self.amount or 0)


class SettlementType(DjangoObjectType):
    amount = graphene.Float()

    class Meta:
        model = Settlement
        fields = "__all__"

    def resolve_amount(self, info):
        return float(self.amount or 0)


class ProductSetItemType(DjangoObjectType):
    class Meta:
        model = ProductSetItem
        fields = "__all__"


class ProductSetType(DjangoObjectType):
    cost_price = graphene.Float()
    sale_price = graphene.Float()

    class Meta:
        model = ProductSet
        fields = "__all__"

    def resolve_cost_price(self, info):
        return float(self.cost_price or 0)

    def resolve_sale_price(self, info):
        return float(self.sale_price or 0)


class FinishedProductOptionType(DjangoObjectType):
    class Meta:
        model = FinishedProductOption
        fields = "__all__"


class PurchaseOrderItemType(DjangoObjectType):
    photos = graphene.String()

    class Meta:
        model = PurchaseOrderItem
        fields = "__all__"

    def resolve_photos(self, info):
        return to_urls_csv(self.photos)


class PurchaseOrderType(DjangoObjectType):
    created_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")
    received_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")
    parcel_inspection = graphene.Field("warehouse.schema.types.ParcelInspectionType")

    class Meta:
        model = PurchaseOrder
        fields = "__all__"

    def resolve_created_by(self, info):
        if not self.created_by_id:
            return None
        try:
            return self.created_by.profile
        except (AttributeError, EmployeeProfile.DoesNotExist):
            return None

    def resolve_received_by(self, info):
        if not self.received_by_id:
            return None
        try:
            return self.received_by.profile
        except (AttributeError, EmployeeProfile.DoesNotExist):
            return None

    def resolve_parcel_inspection(self, info):
        try:
            return self.parcel_inspection
        except ParcelInspection.DoesNotExist:
            return None


class PurchaseBillItemType(DjangoObjectType):
    total_price = graphene.Float()
    total_meters = graphene.Float()
    cost_per_meter = graphene.Float()
    unit_price = graphene.Float()
    gst_rate = graphene.Float()

    class Meta:
        model = PurchaseBillItem
        fields = "__all__"

    def resolve_total_price(self, info):
        return float(self.total_price)

    def resolve_total_meters(self, info):
        return float(self.total_meters) if self.total_meters else None

    def resolve_cost_per_meter(self, info):
        return float(self.cost_per_meter) if self.cost_per_meter else None

    def resolve_unit_price(self, info):
        return float(self.unit_price) if self.unit_price else None

    def resolve_gst_rate(self, info):
        return float(self.gst_rate)


class PurchaseBillType(DjangoObjectType):
    bill_image = graphene.String()
    taxable_amount = graphene.Float()
    tax_amount = graphene.Float()
    cgst_amount = graphene.Float()
    sgst_amount = graphene.Float()
    igst_amount = graphene.Float()
    total_amount = graphene.Float()
    amount_paid = graphene.Float()
    amount_pending = graphene.Float()
    source_po = graphene.Field("warehouse.schema.types.PurchaseOrderType")

    class Meta:
        model = PurchaseBill
        fields = "__all__"

    def resolve_bill_image(self, info):
        return to_url(self.bill_image)

    def resolve_source_po(self, info):
        return self.source_po

    def resolve_taxable_amount(self, info):
        return float(self.taxable_amount)

    def resolve_tax_amount(self, info):
        return float(self.tax_amount)

    def resolve_cgst_amount(self, info):
        return float(self.cgst_amount)

    def resolve_sgst_amount(self, info):
        return float(self.sgst_amount)

    def resolve_igst_amount(self, info):
        return float(self.igst_amount)

    def resolve_total_amount(self, info):
        return float(self.total_amount)

    def resolve_amount_paid(self, info):
        return float(self.amount_paid)

    def resolve_amount_pending(self, info):
        return float(self.amount_pending)


class RawClothBatchType(DjangoObjectType):
    available_meters = graphene.Float()
    total_meters = graphene.Float()
    cost_per_meter = graphene.Float()

    class Meta:
        model = RawClothBatch
        fields = "__all__"

    def resolve_available_meters(self, info):
        return float(self.available_meters)

    def resolve_total_meters(self, info):
        return float(self.total_meters)

    def resolve_cost_per_meter(self, info):
        return float(self.cost_per_meter)


class ReadymadeStockType(DjangoObjectType):
    class Meta:
        model = ReadymadeStock
        fields = "__all__"


class CuttingAssignmentType(DjangoObjectType):
    cost_per_piece = graphene.Float()

    class Meta:
        model = CuttingAssignment
        fields = "__all__"

    def resolve_cost_per_piece(self, info):
        if self.pieces_completed and self.cloth_used:
            cpm = float(self.raw_cloth_batch.cost_per_meter)
            return round(float(self.cloth_used) * cpm / self.pieces_completed, 2)
        return None


class StitchingJobType(DjangoObjectType):
    class Meta:
        model = StitchingJob
        fields = "__all__"


class FinishedProductType(DjangoObjectType):
    profit_margin = graphene.Float()

    class Meta:
        model = FinishedProduct
        fields = "__all__"

    def resolve_profit_margin(self, info):
        return float(self.profit_margin)


class SalesOrderItemType(DjangoObjectType):
    class Meta:
        model = SalesOrderItem
        fields = "__all__"


class SalesOrderType(DjangoObjectType):
    tax_amount = graphene.Float()
    cgst_amount = graphene.Float()
    sgst_amount = graphene.Float()
    igst_amount = graphene.Float()
    subtotal = graphene.Float()
    discount = graphene.Float()
    total_amount = graphene.Float()
    amount_paid = graphene.Float()
    amount_due = graphene.Float()
    dispatch_photos = graphene.String()
    freight_charges = graphene.Float()

    def resolve_dispatch_photos(self, info):
        return to_urls_csv(self.dispatch_photos)

    def resolve_freight_charges(self, info):
        return float(self.freight_charges or 0)

    class Meta:
        model = SalesOrder
        fields = "__all__"

    def resolve_tax_amount(self, info): return float(self.tax_amount)
    def resolve_cgst_amount(self, info): return float(self.cgst_amount)
    def resolve_sgst_amount(self, info): return float(self.sgst_amount)
    def resolve_igst_amount(self, info): return float(self.igst_amount)
    def resolve_subtotal(self, info): return float(self.subtotal)
    def resolve_discount(self, info): return float(self.discount)
    def resolve_total_amount(self, info): return float(self.total_amount)
    def resolve_amount_paid(self, info): return float(self.amount_paid)
    def resolve_amount_due(self, info): return float(self.amount_due)


class CreditPaymentType(DjangoObjectType):
    class Meta:
        model = CreditPayment
        fields = "__all__"


class CreditTransactionType(DjangoObjectType):
    class Meta:
        model = CreditTransaction
        fields = "__all__"


class BuyerReturnType(DjangoObjectType):
    class Meta:
        model = BuyerReturn
        fields = "__all__"


class SupplierReturnType(DjangoObjectType):
    class Meta:
        model = SupplierReturn
        fields = "__all__"


class ReorderPointType(DjangoObjectType):
    threshold_meters = graphene.Float()

    class Meta:
        model = ReorderPoint
        fields = "__all__"

    def resolve_threshold_meters(self, info):
        return float(self.threshold_meters) if self.threshold_meters is not None else None


class StockTransferType(DjangoObjectType):
    meters_to_transfer = graphene.Float()
    created_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")
    received_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")

    class Meta:
        model = StockTransfer
        fields = "__all__"

    def resolve_meters_to_transfer(self, info):
        return float(self.meters_to_transfer) if self.meters_to_transfer is not None else None

    def resolve_created_by(self, info):
        if not self.created_by_id:
            return None
        try:
            return self.created_by.profile
        except (AttributeError, EmployeeProfile.DoesNotExist):
            return None

    def resolve_received_by(self, info):
        if not self.received_by_id:
            return None
        try:
            return self.received_by.profile
        except (AttributeError, EmployeeProfile.DoesNotExist):
            return None


class ParcelInspectionType(DjangoObjectType):
    inspected_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")
    photos = graphene.String()

    class Meta:
        model = ParcelInspection
        fields = "__all__"

    def resolve_photos(self, info):
        return to_urls_csv(self.photos)

    def resolve_inspected_by(self, info):
        if not self.inspected_by_id:
            return None
        try:
            return self.inspected_by.profile
        except (AttributeError, EmployeeProfile.DoesNotExist):
            return None


class NotificationType(DjangoObjectType):
    class Meta:
        model = Notification
        fields = "__all__"


class AuditLogType(DjangoObjectType):
    class Meta:
        model = AuditLog
        fields = "__all__"


# ─── analytics ────────────────────────────────────────────────────────────────

class MonthlyRevenueStat(graphene.ObjectType):
    month = graphene.String()
    revenue = graphene.Float()
    order_count = graphene.Int()


class MonthlyProductionStat(graphene.ObjectType):
    month = graphene.String()
    pieces_cut = graphene.Int()
    pieces_stitched = graphene.Int()
    cloth_wasted = graphene.Float()


class RevenueExpenseStat(graphene.ObjectType):
    month = graphene.String()
    revenue = graphene.Float()
    expenses = graphene.Float()


class StockCategoryStat(graphene.ObjectType):
    category = graphene.String()
    meters = graphene.Float()
    pieces = graphene.Int()


class TopBuyerStat(graphene.ObjectType):
    buyer_name = graphene.String()
    total_spend = graphene.Float()
    order_count = graphene.Int()


class TopSupplierStat(graphene.ObjectType):
    supplier_name = graphene.String()
    total_purchased = graphene.Float()
    total_paid = graphene.Float()
    total_pending = graphene.Float()


class SizeSalesStat(graphene.ObjectType):
    size = graphene.String()
    quantity_sold = graphene.Int()
    revenue = graphene.Float()


class TailorProductivityStat(graphene.ObjectType):
    tailor_name = graphene.String()
    pieces_completed = graphene.Int()
    pieces_rejected = graphene.Int()
    rejection_rate = graphene.Float()
    jobs_count = graphene.Int()


class CuttingMasterStat(graphene.ObjectType):
    master_name = graphene.String()
    pieces_cut = graphene.Int()
    cloth_wasted = graphene.Float()
    wastage_pct = graphene.Float()
    assignments_count = graphene.Int()


class AnalyticsStats(graphene.ObjectType):
    monthly_revenue = graphene.List(MonthlyRevenueStat)
    monthly_production = graphene.List(MonthlyProductionStat)
    revenue_vs_expenses = graphene.List(RevenueExpenseStat)
    stock_by_category = graphene.List(StockCategoryStat)
    top_buyers = graphene.List(TopBuyerStat)
    top_suppliers = graphene.List(TopSupplierStat)
    cloth_wastage_pct = graphene.Float()
    supplier_total_pending = graphene.Float()
    size_sales_breakdown = graphene.List(SizeSalesStat)
    tailor_productivity = graphene.List(TailorProductivityStat)
    cutting_master_stats = graphene.List(CuttingMasterStat)


class SupplierPaymentType(DjangoObjectType):
    amount = graphene.Float()

    class Meta:
        model = SupplierPayment
        fields = "__all__"

    def resolve_amount(self, info):
        return float(self.amount)


class StockAdjustmentType(DjangoObjectType):
    quantity_change = graphene.Float()

    class Meta:
        model = StockAdjustment
        fields = "__all__"

    def resolve_quantity_change(self, info):
        return float(self.quantity_change)


class ExpenseType(DjangoObjectType):
    amount = graphene.Float()
    proof_image = graphene.String()

    class Meta:
        model = Expense
        fields = "__all__"

    def resolve_amount(self, info):
        return float(self.amount)

    def resolve_proof_image(self, info):
        return to_url(self.proof_image)


class PublicSettingsType(graphene.ObjectType):
    """Branding only, readable without logging in.

    The login screen needs the company's name, logo and colours before anyone
    has a token. It used to ask for these through `systemSettings`, which is
    @login_required, so the request always failed and the error was swallowed —
    every customer saw the stock "GarmentFlow" branding on their own login page.

    This is a hand-written type rather than the model type with a filter: it can
    only ever return these seven fields, so no future model field is exposed to
    anonymous callers by accident.
    """
    app_name = graphene.String()
    app_subtitle = graphene.String()
    logo_url = graphene.String()
    primary_color = graphene.String()
    accent_color = graphene.String()
    default_dark_mode = graphene.Boolean()
    company_name = graphene.String()


class SystemSettingsType(DjangoObjectType):
    # JSONField would otherwise serialise to a JSONString scalar, so the client
    # receives the string "[]" instead of a list — expose it as a real list.
    tag_component_order = graphene.List(graphene.String)
    logo_url = graphene.String()
    tag_logo_data = graphene.String()

    # Redeclared as nullable on purpose. The model columns are NOT NULL, so the
    # generated schema made them String!/Int!/Boolean! — and the admin-only
    # resolvers below return None to everyone else, which a non-null field
    # rejects outright, taking the whole Settings query down with it.
    smtp_host = graphene.String()
    smtp_port = graphene.Int()
    smtp_user = graphene.String()
    smtp_from_email = graphene.String()
    smtp_use_tls = graphene.Boolean()
    twilio_account_sid = graphene.String()
    twilio_from_number = graphene.String()
    wa_phone_number_id = graphene.String()
    gstin = graphene.String()

    class Meta:
        model = SystemSettings
        # These are write-only on purpose. The settings resolver is only
        # @login_required, so with fields = "__all__" any employee — a tailor,
        # an auditor — could read the live SMTP password, WhatsApp token and
        # Firebase service-account key straight out of the API. The UI never
        # reads them back (it only sends them in the update mutation), so
        # excluding them from the schema costs nothing.
        exclude = (
            "smtp_password",
            "twilio_auth_token",
            "wa_token",
            "firebase_service_account_json",
        )

    def resolve_tag_component_order(self, info):
        return self.tag_component_order or []

    def resolve_logo_url(self, info):
        return to_url(self.logo_url)

    def resolve_tag_logo_data(self, info):
        return to_url(self.tag_logo_data)


# Excluding the passwords and tokens was only half the job: the config around
# them still identified the accounts. A tailor could read the mail server and
# username, and the Twilio account SID and sending number — enough to aim an
# attack at those accounts, and none of it is their business. Only the roles
# that can edit these in Settings can read them back.
_ADMIN_ONLY_SETTINGS = (
    "smtp_host", "smtp_port", "smtp_user", "smtp_from_email", "smtp_use_tls",
    "twilio_account_sid", "twilio_from_number",
    "wa_phone_number_id", "gstin",
)


def _admin_only(field_name):
    def resolver(self, info):
        profile = EmployeeProfile.objects.filter(user=info.context.user).first()
        if profile and profile.role in ELEVATED_ROLES:
            return getattr(self, field_name)
        return None
    return resolver


for _f in _ADMIN_ONLY_SETTINGS:
    setattr(SystemSettingsType, f"resolve_{_f}", _admin_only(_f))


class DashboardStats(graphene.ObjectType):
    total_raw_meters = graphene.Float()
    total_finished_pieces = graphene.Int()
    readymade_pieces = graphene.Int()
    inhouse_pieces = graphene.Int()
    active_purchase_orders = graphene.Int()
    active_sales_orders = graphene.Int()
    cutting_in_progress = graphene.Int()
    stitching_in_progress = graphene.Int()
    credit_outstanding = graphene.Float()
    revenue_this_month = graphene.Float()
    revenue_this_year = graphene.Float()
    total_suppliers = graphene.Int()
    total_buyers = graphene.Int()
    # Supplier payment summary (via Purchase Bills)
    supplier_total_purchased = graphene.Float()
    supplier_total_paid = graphene.Float()
    supplier_total_pending = graphene.Float()
    # Buyer credit breakdown
    credit_received = graphene.Float()
    credit_overdue = graphene.Float()
    credit_settled = graphene.Float()
    # Expenses
    expenses_this_month = graphene.Float()
    expenses_this_year = graphene.Float()


# ─── Quotation ────────────────────────────────────────────────────────────────

class QuotationItemType(DjangoObjectType):
    unit_price = graphene.Float()
    total_price = graphene.Float()

    class Meta:
        model = QuotationItem
        fields = "__all__"

    def resolve_unit_price(self, info): return float(self.unit_price)
    def resolve_total_price(self, info): return float(self.total_price)


class QuotationType(DjangoObjectType):
    subtotal = graphene.Float()
    discount = graphene.Float()
    tax_amount = graphene.Float()
    total_amount = graphene.Float()
    created_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")

    class Meta:
        model = Quotation
        fields = "__all__"

    def resolve_subtotal(self, info): return float(self.subtotal)
    def resolve_discount(self, info): return float(self.discount)
    def resolve_tax_amount(self, info): return float(self.tax_amount)
    def resolve_total_amount(self, info): return float(self.total_amount)

    def resolve_created_by(self, info):
        if not self.created_by_id:
            return None
        try:
            return self.created_by.profile
        except (AttributeError, EmployeeProfile.DoesNotExist):
            return None


# ─── P&L Report ───────────────────────────────────────────────────────────────

class PLMonthStat(graphene.ObjectType):
    month = graphene.String()
    revenue = graphene.Float()
    cogs = graphene.Float()
    gross_profit = graphene.Float()
    expenses = graphene.Float()
    net_profit = graphene.Float()


class PLReport(graphene.ObjectType):
    period_label = graphene.String()
    revenue = graphene.Float()
    cogs = graphene.Float()
    gross_profit = graphene.Float()
    expenses = graphene.Float()
    net_profit = graphene.Float()
    gross_margin_pct = graphene.Float()
    net_margin_pct = graphene.Float()
    monthly = graphene.List(PLMonthStat)


# ─── Aging Report ─────────────────────────────────────────────────────────────

class BuyerAgingRow(graphene.ObjectType):
    buyer_name = graphene.String()
    bucket_0_30 = graphene.Float()
    bucket_31_60 = graphene.Float()
    bucket_61_90 = graphene.Float()
    bucket_91_plus = graphene.Float()
    total = graphene.Float()


class SupplierAgingRow(graphene.ObjectType):
    supplier_name = graphene.String()
    bucket_0_30 = graphene.Float()
    bucket_31_60 = graphene.Float()
    bucket_61_90 = graphene.Float()
    bucket_91_plus = graphene.Float()
    total = graphene.Float()


class AgingReport(graphene.ObjectType):
    buyer_rows = graphene.List(BuyerAgingRow)
    supplier_rows = graphene.List(SupplierAgingRow)
    total_buyer_outstanding = graphene.Float()
    total_supplier_outstanding = graphene.Float()
