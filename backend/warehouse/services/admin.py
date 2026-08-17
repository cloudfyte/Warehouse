from django.contrib.auth import get_user_model
from django.db import transaction
from graphql import GraphQLError

from warehouse.models import (
    AuditLog, BuyerReturn, ClothCategory, ClothColor, CreditPayment,
    CreditTransaction, CuttingAssignment, CustomRole, EmployeeProfile,
    Expense, FCMToken, FinishedProduct, ItemType, Notification, OTPCode,
    ParcelInspection, PurchaseBill, PurchaseBillItem, PurchaseOrder,
    PurchaseOrderItem, Quotation, QuotationItem, RawClothBatch,
    ReadymadeStock, ReorderPoint, SalesOrder, SalesOrderItem, StitchingJob,
    StockAdjustment, StockTransfer, Supplier, SupplierPayment, SupplierReturn,
    Buyer, WarehouseLocation,
)
from warehouse.permissions import require_role

CONFIRM_PHRASE = "RESET ALL DATA"


@transaction.atomic
def reset_all_data(user, confirm_phrase: str) -> None:
    require_role(user, EmployeeProfile.Role.SUPER_ADMIN)
    if confirm_phrase != CONFIRM_PHRASE:
        raise GraphQLError(
            f'Confirmation phrase does not match. Type exactly: {CONFIRM_PHRASE}'
        )

    User = get_user_model()

    # Auth tokens and logs
    OTPCode.objects.all().delete()
    FCMToken.objects.all().delete()
    AuditLog.objects.all().delete()
    Notification.objects.all().delete()

    # Finance — most dependent first
    CreditPayment.objects.all().delete()
    CreditTransaction.objects.all().delete()

    # Quotations
    QuotationItem.objects.all().delete()
    Quotation.objects.all().delete()

    # Sales — items before order, returns before order
    SalesOrderItem.objects.all().delete()
    BuyerReturn.objects.all().delete()
    SalesOrder.objects.all().delete()

    # Supplier returns (depends on Supplier / RawClothBatch)
    SupplierReturn.objects.all().delete()

    # Production pipeline — downstream first
    FinishedProduct.objects.all().delete()
    StitchingJob.objects.all().delete()
    CuttingAssignment.objects.all().delete()
    ReadymadeStock.objects.all().delete()

    # Inventory management
    StockAdjustment.objects.all().delete()
    StockTransfer.objects.all().delete()
    ReorderPoint.objects.all().delete()

    # Purchasing
    ParcelInspection.objects.all().delete()
    PurchaseOrderItem.objects.all().delete()
    PurchaseOrder.objects.all().delete()
    SupplierPayment.objects.all().delete()
    PurchaseBillItem.objects.all().delete()
    PurchaseBill.objects.all().delete()

    # Raw stock
    RawClothBatch.objects.all().delete()

    # Operational costs
    Expense.objects.all().delete()

    # Parties
    Buyer.objects.all().delete()
    Supplier.objects.all().delete()

    # Employees — keep the calling SUPER_ADMIN
    EmployeeProfile.objects.exclude(user=user).delete()
    User.objects.exclude(pk=user.pk).delete()

    # Warehouse locations
    WarehouseLocation.objects.all().delete()

    # Cloth master data
    ClothCategory.objects.all().delete()
    ClothColor.objects.all().delete()
    ItemType.objects.all().delete()

    # Custom roles
    CustomRole.objects.all().delete()
