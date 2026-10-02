from django.contrib import admin

from .models import (
    Buyer,
    ClothCategory,
    ClothColor,
    CreditTransaction,
    CuttingAssignment,
    EmployeeProfile,
    FinishedProduct,
    ItemType,
    Notification,
    OTPCode,
    PurchaseOrder,
    RawClothBatch,
    SalesOrder,
    StitchingJob,
    Supplier,
    SystemSettings,
    WarehouseLocation,
)


@admin.register(WarehouseLocation)
class WarehouseLocationAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "location_type", "city", "state", "active")
    search_fields = ("code", "name", "city")
    list_filter = ("active", "location_type")


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ("get_username", "role", "phone", "active", "created_at")
    list_filter = ("role", "active")
    search_fields = ("user__username", "user__email", "phone")
    readonly_fields = ("created_at",)

    @admin.display(description="Username")
    def get_username(self, obj):
        return obj.user.username


@admin.register(ClothCategory)
class ClothCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "active")
    search_fields = ("name",)
    list_filter = ("active",)


@admin.register(ClothColor)
class ClothColorAdmin(admin.ModelAdmin):
    list_display = ("name", "hex_code", "active")
    search_fields = ("name",)


@admin.register(ItemType)
class ItemTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "cloth_length_per_piece", "active")
    search_fields = ("name", "category")
    list_filter = ("active", "category")


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_person", "phone", "supply_type", "gstin", "active")
    search_fields = ("name", "gstin", "email")
    list_filter = ("active", "supply_type")


@admin.register(Buyer)
class BuyerAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_person", "phone", "buyer_type", "credit_limit", "active")
    search_fields = ("name", "gstin", "email")
    list_filter = ("active", "buyer_type")


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("po_number", "supplier", "order_type", "status", "order_date", "total_amount")
    list_filter = ("status", "order_type")
    search_fields = ("po_number", "supplier__name")
    readonly_fields = ("po_number", "created_at", "updated_at")


@admin.register(RawClothBatch)
class RawClothBatchAdmin(admin.ModelAdmin):
    list_display = ("batch_number", "cloth_category", "cloth_color", "available_meters", "total_meters", "warehouse")
    search_fields = ("batch_number",)
    list_filter = ("cloth_category", "cloth_color", "warehouse")
    readonly_fields = ("batch_number", "created_at")


@admin.register(CuttingAssignment)
class CuttingAssignmentAdmin(admin.ModelAdmin):
    list_display = ("assignment_number", "cutting_master", "item_type", "meters_assigned", "target_pieces", "pieces_completed", "status")
    list_filter = ("status", "item_type")
    search_fields = ("assignment_number",)
    readonly_fields = ("assignment_number", "created_at")


@admin.register(StitchingJob)
class StitchingJobAdmin(admin.ModelAdmin):
    list_display = ("job_number", "karigar", "pieces_assigned", "pieces_completed", "pieces_rejected", "status")
    list_filter = ("status",)
    search_fields = ("job_number",)
    readonly_fields = ("job_number", "created_at")


@admin.register(FinishedProduct)
class FinishedProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "item_type", "source", "cloth_color", "size", "quantity", "sale_price", "tags_printed")
    list_filter = ("source", "item_type", "tags_printed", "warehouse")
    search_fields = ("sku", "barcode")
    readonly_fields = ("sku", "barcode", "created_at")


@admin.register(SalesOrder)
class SalesOrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "buyer", "status", "payment_mode", "total_amount", "amount_due", "order_date")
    list_filter = ("status", "payment_mode")
    search_fields = ("order_number", "buyer__name")
    readonly_fields = ("order_number", "created_at")


@admin.register(CreditTransaction)
class CreditTransactionAdmin(admin.ModelAdmin):
    list_display = ("sales_order", "buyer", "total_amount", "amount_paid", "amount_due", "status", "due_date")
    list_filter = ("status",)
    search_fields = ("buyer__name", "sales_order__order_number")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "title", "level", "read", "created_at")
    list_filter = ("level", "read")
    search_fields = ("title", "recipient__username")
    readonly_fields = ("created_at",)


@admin.register(OTPCode)
class OTPCodeAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "channel", "used", "expires_at", "created_at")
    list_filter = ("purpose", "channel", "used")
    readonly_fields = ("created_at",)


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    list_display = ("app_name", "primary_color", "sms_enabled", "updated_at")
    readonly_fields = ("updated_at", "updated_by")

    def has_add_permission(self, request):
        return not SystemSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
