import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.audit import log_action
from warehouse.services.notify import notify_managers
from warehouse.services.sales import (
    create_sales_order, dispatch_sales_order, record_credit_payment,
    update_sales_order_status,
)
from warehouse.schema.types import CreditTransactionType, SalesOrderType


class SOItemInput(graphene.InputObjectType):
    finished_product_id = graphene.ID(required=True)
    quantity = graphene.Int(required=True)
    unit_price = graphene.Float(required=True)


class CreateSalesOrder(graphene.Mutation):
    class Arguments:
        buyer_id = graphene.ID(required=True)
        payment_mode = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        items = graphene.List(graphene.NonNull(SOItemInput), required=True)
        order_date = graphene.Date()
        expected_delivery = graphene.Date()
        discount = graphene.Float()
        notes = graphene.String()
        amount_paid = graphene.Float()

    sales_order = graphene.Field(SalesOrderType)

    @login_required
    def mutate(self, info, buyer_id, payment_mode, warehouse_id, items, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        so = create_sales_order(
            user=info.context.user, buyer_id=buyer_id, payment_mode=payment_mode,
            warehouse_id=warehouse_id, items=[dict(i) for i in items], **kwargs,
        )
        try:
            log_action(entity_type="SalesOrder", entity_id=so.pk, action="CREATED",
                       actor=info.context.user, detail={"order_number": so.order_number, "buyer": so.buyer.name,
                                                         "total": float(so.total_amount)})
            notify_managers(title=f"New SO: {so.order_number}",
                            message=f"{so.order_number} for {so.buyer.name} — ₹{so.total_amount:,.0f}",
                            link="sales_orders")
        except Exception:
            pass
        return CreateSalesOrder(sales_order=so)


class UpdateSalesOrderStatus(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String(required=True)
        actual_delivery = graphene.Date()

    sales_order = graphene.Field(SalesOrderType)

    @login_required
    def mutate(self, info, id, status, actual_delivery=None):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        so = update_sales_order_status(user=info.context.user, id=id, status=status, actual_delivery=actual_delivery)
        log_action(entity_type="SalesOrder", entity_id=so.pk, action=f"STATUS_CHANGED_TO_{status}",
                   actor=info.context.user, detail={"status": status})
        if status == "DELIVERED":
            notify_managers(title=f"Order Delivered: {so.order_number}",
                            message=f"{so.order_number} for {so.buyer.name} marked delivered",
                            level="INFO", link="sales_orders")
        return UpdateSalesOrderStatus(sales_order=so)


class RecordCreditPayment(graphene.Mutation):
    class Arguments:
        credit_id = graphene.ID(required=True)
        amount = graphene.Float(required=True)
        payment_method = graphene.String()
        reference = graphene.String()
        notes = graphene.String()

    credit = graphene.Field(CreditTransactionType)

    @login_required
    def mutate(self, info, credit_id, amount, payment_method="CASH", reference="", notes=""):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        credit = record_credit_payment(
            credit_id=credit_id, amount=amount, payment_method=payment_method,
            reference=reference, notes=notes, user=info.context.user,
        )
        log_action(entity_type="CreditTransaction", entity_id=credit_id, action="PAYMENT_RECORDED",
                   actor=info.context.user, detail={"amount": amount, "method": payment_method})
        return RecordCreditPayment(credit=credit)


class DispatchSalesOrder(graphene.Mutation):
    """Record the lorry receipt and shipment details, and mark the order dispatched."""
    class Arguments:
        id = graphene.ID(required=True)
        transporter_name = graphene.String()
        lr_number = graphene.String()
        vehicle_number = graphene.String()
        driver_phone = graphene.String()
        dispatch_date = graphene.Date()
        freight_charges = graphene.Float()
        dispatch_notes = graphene.String()
        dispatch_photos = graphene.String()

    sales_order = graphene.Field(SalesOrderType)

    @login_required
    def mutate(self, info, id, **kwargs):
        user = info.context.user
        require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
                     EmployeeProfile.Role.STORE_KEEPER)
        so = dispatch_sales_order(user=user, id=id, **kwargs)
        log_action(
            entity_type="SalesOrder", entity_id=so.pk, action="DISPATCHED",
            actor=user,
            detail={"lr_number": so.lr_number, "transporter": so.transporter_name,
                    "vehicle": so.vehicle_number},
        )
        return DispatchSalesOrder(sales_order=so)
