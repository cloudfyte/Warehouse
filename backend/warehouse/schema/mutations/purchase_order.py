import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.services.audit import log_action
from warehouse.services.notify import notify_managers
from warehouse.services.purchase_order import (
    create_purchase_order, receive_purchase_order, update_purchase_order_status,
)
from warehouse.schema.types import PurchaseOrderType


class POItemInput(graphene.InputObjectType):
    item_kind = graphene.String(required=True)
    cloth_category_id = graphene.ID()
    cloth_color_id = graphene.ID()
    ordered_meters = graphene.Float()
    item_type_id = graphene.ID()
    item_name = graphene.String()
    age_group = graphene.String()
    size = graphene.String()
    ordered_quantity = graphene.Int()
    unit_price = graphene.Float()
    notes = graphene.String()


class ReceiptItemInput(graphene.InputObjectType):
    po_item_id = graphene.ID(required=True)
    received_meters = graphene.Float()
    received_quantity = graphene.Int()
    cost_per_meter = graphene.Float()
    bin_location = graphene.String()
    notes = graphene.String()


class CreatePurchaseOrder(graphene.Mutation):
    class Arguments:
        supplier_id = graphene.ID(required=True)
        order_type = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        items = graphene.List(graphene.NonNull(POItemInput), required=True)
        order_date = graphene.Date()
        expected_delivery = graphene.Date()
        notes = graphene.String()

    purchase_order = graphene.Field(PurchaseOrderType)

    @login_required
    def mutate(self, info, supplier_id, order_type, warehouse_id, items, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        po = create_purchase_order(
            user=info.context.user, supplier_id=supplier_id, order_type=order_type,
            warehouse_id=warehouse_id, items=[dict(i) for i in items], **kwargs,
        )
        log_action(entity_type="PurchaseOrder", entity_id=po.pk, action="CREATED",
                   actor=info.context.user, detail={"po_number": po.po_number, "supplier": po.supplier.name})
        notify_managers(title=f"New PO: {po.po_number}",
                        message=f"{po.po_number} created by {info.context.user.username} from {po.supplier.name}",
                        link="purchase_orders")
        return CreatePurchaseOrder(purchase_order=po)


class UpdatePurchaseOrderStatus(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String(required=True)
        actual_delivery = graphene.Date()

    purchase_order = graphene.Field(PurchaseOrderType)

    @login_required
    def mutate(self, info, id, status, actual_delivery=None):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        po = update_purchase_order_status(id=id, status=status, actual_delivery=actual_delivery)
        log_action(entity_type="PurchaseOrder", entity_id=po.pk, action=f"STATUS_CHANGED_TO_{status}",
                   actor=info.context.user, detail={"status": status})
        return UpdatePurchaseOrderStatus(purchase_order=po)


class ReceivePurchaseOrder(graphene.Mutation):
    class Arguments:
        po_id = graphene.ID(required=True)
        receipt_items = graphene.List(graphene.NonNull(ReceiptItemInput), required=True)

    purchase_order = graphene.Field(PurchaseOrderType)

    @login_required
    def mutate(self, info, po_id, receipt_items):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        po = receive_purchase_order(
            po_id=po_id, user=info.context.user, receipt_items=[dict(i) for i in receipt_items],
        )
        log_action(entity_type="PurchaseOrder", entity_id=po.pk, action="RECEIVED",
                   actor=info.context.user, detail={"po_number": po.po_number})
        notify_managers(
            title=f"PO Received: {po.po_number}",
            message=f"Purchase order {po.po_number} from {po.supplier.name} has been received at {po.warehouse.name}.",
            level="INFO",
            link="purchase_orders",
        )
        return ReceivePurchaseOrder(purchase_order=po)
