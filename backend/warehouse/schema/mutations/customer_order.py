import graphene
from graphql_jwt.decorators import login_required

from warehouse.services.customer_order import update_customer_order
from warehouse.schema.types import CustomerOrderType


class UpdateCustomerOrder(graphene.Mutation):
    """Correct a bill — a misheard name, a second page photographed later."""
    class Arguments:
        id = graphene.ID(required=True)
        customer_name = graphene.String()
        customer_phone = graphene.String()
        bill_photos = graphene.String()
        notes = graphene.String()

    order = graphene.Field(CustomerOrderType)

    @login_required
    def mutate(self, info, id, **kwargs):
        return UpdateCustomerOrder(order=update_customer_order(
            user=info.context.user, id=id, **kwargs))
