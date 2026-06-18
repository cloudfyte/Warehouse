import graphene
from graphene_django import DjangoObjectType

from warehouse.models import (
    DamagedProduct,
    EmployeeProfile,
    InventoryBalance,
    Notification,
    Product,
    ReplenishmentRequest,
    ReturnRecord,
    StockMovement,
    SystemSettings,
    Vendor,
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


class InventoryBalanceType(DjangoObjectType):
    is_low_stock = graphene.Boolean()

    class Meta:
        model = InventoryBalance
        fields = "__all__"

    def resolve_is_low_stock(self, info):
        return self.is_low_stock


class VendorType(DjangoObjectType):
    class Meta:
        model = Vendor
        fields = "__all__"


class ProductType(DjangoObjectType):
    is_low_stock = graphene.Boolean()
    balances = graphene.List(InventoryBalanceType)
    gst_rate = graphene.String()

    class Meta:
        model = Product
        fields = "__all__"

    def resolve_is_low_stock(self, info):
        return self.is_low_stock

    def resolve_balances(self, info):
        return self.balances.select_related("warehouse").filter(warehouse__active=True)

    def resolve_gst_rate(self, info):
        return str(self.gst_rate)


class StockMovementType(DjangoObjectType):
    class Meta:
        model = StockMovement
        fields = "__all__"


class ReturnRecordType(DjangoObjectType):
    class Meta:
        model = ReturnRecord
        fields = "__all__"


class DamagedProductType(DjangoObjectType):
    class Meta:
        model = DamagedProduct
        fields = "__all__"


class NotificationType(DjangoObjectType):
    class Meta:
        model = Notification
        fields = "__all__"


class ReplenishmentRequestType(DjangoObjectType):
    class Meta:
        model = ReplenishmentRequest
        fields = "__all__"


class SystemSettingsType(DjangoObjectType):
    """Public-safe subset — excludes Twilio credentials."""
    class Meta:
        model = SystemSettings
        fields = (
            "app_name", "app_subtitle", "logo_url",
            "primary_color", "accent_color", "default_dark_mode",
            "whatsapp_enabled", "whatsapp_from_number",
            "alert_email", "updated_at",
        )


class DashboardStats(graphene.ObjectType):
    total_products = graphene.Int()
    total_units = graphene.Int()
    low_stock_products = graphene.Int()
    total_vendors = graphene.Int()
    pending_returns = graphene.Int()
    damaged_units = graphene.Int()
    inventory_value = graphene.Float()
