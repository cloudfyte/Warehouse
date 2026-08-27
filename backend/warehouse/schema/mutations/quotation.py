import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import require_role
from warehouse.schema.types import QuotationType, SalesOrderType

# Converting a quotation calls the same create_sales_order service that
# CreateSalesOrder guards with these roles — without the guard, quotations were
# an unchecked route to issuing orders and shipping stock.
_SALES_ROLES = (EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)


class QuotationItemInput(graphene.InputObjectType):
    finished_product_id = graphene.ID(required=True)
    quantity = graphene.Int(required=True)
    unit_price = graphene.Float(required=True)


class CreateQuotation(graphene.Mutation):
    class Arguments:
        buyer_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        items = graphene.List(graphene.NonNull(QuotationItemInput), required=True)
        discount = graphene.Float()
        notes = graphene.String()
        validity_date = graphene.Date()

    quotation = graphene.Field(QuotationType)

    @login_required
    def mutate(self, info, buyer_id, warehouse_id, items, discount=0, notes="", validity_date=None):
        require_role(info.context.user, *_SALES_ROLES)
        from warehouse.services.quotation import create_quotation
        qt = create_quotation(
            user=info.context.user,
            buyer_id=buyer_id,
            warehouse_id=warehouse_id,
            items=[
                {"finished_product_id": it.finished_product_id, "quantity": it.quantity, "unit_price": it.unit_price}
                for it in items
            ],
            discount=discount,
            notes=notes,
            validity_date=validity_date,
        )
        return CreateQuotation(quotation=qt)


class UpdateQuotationStatus(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String(required=True)

    quotation = graphene.Field(QuotationType)

    @login_required
    def mutate(self, info, id, status):
        require_role(info.context.user, *_SALES_ROLES)
        from warehouse.services.quotation import update_quotation_status
        qt = update_quotation_status(id=id, status=status)
        return UpdateQuotationStatus(quotation=qt)


class ConvertQuotationToSO(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        payment_mode = graphene.String()
        amount_paid = graphene.Float()

    sales_order = graphene.Field(SalesOrderType)

    @login_required
    def mutate(self, info, id, payment_mode="CREDIT", amount_paid=None):
        require_role(info.context.user, *_SALES_ROLES)
        from warehouse.services.quotation import convert_quotation_to_so
        so = convert_quotation_to_so(id=id, user=info.context.user, payment_mode=payment_mode, amount_paid=amount_paid)
        return ConvertQuotationToSO(sales_order=so)
