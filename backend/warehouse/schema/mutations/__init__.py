import graphene
import graphql_jwt

from .auth import DeleteFcmToken, LoginWithCredentials, RequestOTP, SaveFcmToken, VerifyOTPLogin
from .employee import ChangeMyPassword, CreateEmployee, ResetEmployeePassword, UpdateEmployee, UpdateMyProfile
from .master import (
    CreateClothCategory, CreateClothColor, CreateItemType, CreateWarehouseLocation,
    UpdateClothCategory, UpdateClothColor, UpdateItemType, UpdateWarehouseLocation,
)
from .notifications import MarkNotificationsRead
from .stock_adjustment import CreateStockAdjustment, DeleteStockAdjustment
from .supplier_payment import CreateSupplierPayment, DeleteSupplierPayment
from .production import (
    CreateCuttingAssignment, CreateFinishedProducts,
    CreateStitchingJob, UpdateCuttingAssignment, UpdateStitchingJob,
)
from .expense import CreateExpense, UpdateExpense, DeleteExpense
from .purchase_bill import CreatePurchaseBill
from .purchase_order import CreatePurchaseOrder, ReceivePurchaseOrder, UpdatePurchaseOrderStatus
from .stock import CreateRawClothBatch, CreateReadymadeStock
from .sales import CreateSalesOrder, RecordCreditPayment, UpdateSalesOrderStatus
from .settings import UpdateSystemSettings
from .supplier import CreateBuyer, CreateSupplier, UpdateBuyer, UpdateSupplier


class Mutation(graphene.ObjectType):
    # Auth
    token_auth = graphql_jwt.ObtainJSONWebToken.Field()
    verify_token = graphql_jwt.Verify.Field()
    refresh_token = graphql_jwt.Refresh.Field()
    login_with_credentials = LoginWithCredentials.Field()
    request_otp = RequestOTP.Field()
    verify_otp_login = VerifyOTPLogin.Field()

    # Master data
    create_cloth_category = CreateClothCategory.Field()
    update_cloth_category = UpdateClothCategory.Field()
    create_cloth_color = CreateClothColor.Field()
    update_cloth_color = UpdateClothColor.Field()
    create_item_type = CreateItemType.Field()
    update_item_type = UpdateItemType.Field()
    create_warehouse_location = CreateWarehouseLocation.Field()
    update_warehouse_location = UpdateWarehouseLocation.Field()

    # People
    create_employee = CreateEmployee.Field()
    update_employee = UpdateEmployee.Field()
    reset_employee_password = ResetEmployeePassword.Field()
    update_my_profile = UpdateMyProfile.Field()
    change_my_password = ChangeMyPassword.Field()

    # Suppliers & buyers
    create_supplier = CreateSupplier.Field()
    update_supplier = UpdateSupplier.Field()
    create_buyer = CreateBuyer.Field()
    update_buyer = UpdateBuyer.Field()

    # Purchase orders
    create_purchase_order = CreatePurchaseOrder.Field()
    update_purchase_order_status = UpdatePurchaseOrderStatus.Field()
    receive_purchase_order = ReceivePurchaseOrder.Field()

    # Direct purchase bills
    create_purchase_bill = CreatePurchaseBill.Field()

    # Direct stock entry
    create_raw_cloth_batch = CreateRawClothBatch.Field()
    create_readymade_stock = CreateReadymadeStock.Field()

    # Production pipeline
    create_cutting_assignment = CreateCuttingAssignment.Field()
    update_cutting_assignment = UpdateCuttingAssignment.Field()
    create_stitching_job = CreateStitchingJob.Field()
    update_stitching_job = UpdateStitchingJob.Field()
    create_finished_products = CreateFinishedProducts.Field()

    # Sales & credit
    create_sales_order = CreateSalesOrder.Field()
    update_sales_order_status = UpdateSalesOrderStatus.Field()
    record_credit_payment = RecordCreditPayment.Field()

    # FCM push tokens
    save_fcm_token = SaveFcmToken.Field()
    delete_fcm_token = DeleteFcmToken.Field()

    # Expenses
    create_expense = CreateExpense.Field()
    update_expense = UpdateExpense.Field()
    delete_expense = DeleteExpense.Field()

    # Supplier payments
    create_supplier_payment = CreateSupplierPayment.Field()
    delete_supplier_payment = DeleteSupplierPayment.Field()

    # Stock adjustments
    create_stock_adjustment = CreateStockAdjustment.Field()
    delete_stock_adjustment = DeleteStockAdjustment.Field()

    # Misc
    mark_notifications_read = MarkNotificationsRead.Field()
    update_system_settings = UpdateSystemSettings.Field()
