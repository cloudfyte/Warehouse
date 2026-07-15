import graphene
from graphene_django import DjangoObjectType

from warehouse.models import (
    AuditLog,
    Buyer,
    BuyerReturn,
    ClothCategory,
    ClothColor,
    CreditPayment,
    CreditTransaction,
    CuttingAssignment,
    EmployeeProfile,
    FinishedProduct,
    ItemType,
    Notification,
    OTPCode,
    PurchaseBill,
    PurchaseBillItem,
    PurchaseOrder,
    PurchaseOrderItem,
    RawClothBatch,
    ReadymadeStock,
    SalesOrder,
    SalesOrderItem,
    StitchingJob,
    Supplier,
    SupplierReturn,
    SystemSettings,
    WarehouseLocation,
)


class WarehouseLocationType(DjangoObjectType):
    class Meta:
        model = WarehouseLocation
        fields = "__all__"


class EmployeeProfileType(DjangoObjectType):
    username = graphene.String()
    email = graphene.String()

    class Meta:
        model = EmployeeProfile
        fields = ("id", "role", "phone", "locations", "active", "created_at")

    def resolve_username(self, info):
        return self.user.username

    def resolve_email(self, info):
        return self.user.email


class ClothCategoryType(DjangoObjectType):
    class Meta:
        model = ClothCategory
        fields = "__all__"


class ClothColorType(DjangoObjectType):
    class Meta:
        model = ClothColor
        fields = "__all__"


class ItemTypeType(DjangoObjectType):
    class Meta:
        model = ItemType
        fields = "__all__"


class SupplierType(DjangoObjectType):
    class Meta:
        model = Supplier
        fields = "__all__"


class BuyerType(DjangoObjectType):
    class Meta:
        model = Buyer
        fields = "__all__"


class PurchaseOrderItemType(DjangoObjectType):
    class Meta:
        model = PurchaseOrderItem
        fields = "__all__"


class PurchaseOrderType(DjangoObjectType):
    class Meta:
        model = PurchaseOrder
        fields = "__all__"


class PurchaseBillItemType(DjangoObjectType):
    total_price = graphene.Float()
    total_meters = graphene.Float()
    cost_per_meter = graphene.Float()
    unit_price = graphene.Float()

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


class PurchaseBillType(DjangoObjectType):
    total_amount = graphene.Float()
    amount_paid = graphene.Float()
    amount_pending = graphene.Float()

    class Meta:
        model = PurchaseBill
        fields = "__all__"

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
    class Meta:
        model = CuttingAssignment
        fields = "__all__"


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
    class Meta:
        model = SalesOrder
        fields = "__all__"


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


class StockCategoryStat(graphene.ObjectType):
    category = graphene.String()
    meters = graphene.Float()
    pieces = graphene.Int()


class TopBuyerStat(graphene.ObjectType):
    buyer_name = graphene.String()
    total_spend = graphene.Float()
    order_count = graphene.Int()


class AnalyticsStats(graphene.ObjectType):
    monthly_revenue = graphene.List(MonthlyRevenueStat)
    stock_by_category = graphene.List(StockCategoryStat)
    top_buyers = graphene.List(TopBuyerStat)


class SystemSettingsType(DjangoObjectType):
    class Meta:
        model = SystemSettings
        fields = "__all__"


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
