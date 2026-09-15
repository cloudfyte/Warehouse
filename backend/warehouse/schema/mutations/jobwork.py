import graphene
from graphql_jwt.decorators import login_required

from warehouse.services.jobwork import create_jobwork_order, pay_jobwork, receive_jobwork
from warehouse.schema.types import JobworkOrderType


class JobworkSizeInput(graphene.InputObjectType):
    size = graphene.String(required=True)
    pieces = graphene.Int()
    received = graphene.Int()


class CreateJobworkOrder(graphene.Mutation):
    """Give a whole job — cutting and stitching — to an outside handler."""
    class Arguments:
        karigar_id = graphene.ID(required=True)
        item_type_id = graphene.ID(required=True)
        receive_warehouse_id = graphene.ID(required=True)
        sizes = graphene.List(graphene.NonNull(JobworkSizeInput), required=True)
        supplier_id = graphene.ID()
        design_number = graphene.String()
        cloth_meters = graphene.Float()
        cloth_cost = graphene.Float()
        rate_per_piece = graphene.Float()
        job_type = graphene.String()
        customer_bill_number = graphene.String()
        due_date = graphene.Date()
        notes = graphene.String()
        sent_transporter = graphene.String()
        sent_lr_number = graphene.String()
        sent_vehicle_number = graphene.String()
        sent_photos = graphene.String()

    order = graphene.Field(JobworkOrderType)

    @login_required
    def mutate(self, info, sizes, **kwargs):
        return CreateJobworkOrder(order=create_jobwork_order(
            user=info.context.user, sizes=[dict(r) for r in sizes], **kwargs))


class ReceiveJobwork(graphene.Mutation):
    """Book the garments that came back, counted by size."""
    class Arguments:
        id = graphene.ID(required=True)
        sizes = graphene.List(graphene.NonNull(JobworkSizeInput), required=True)
        received_date = graphene.Date()
        # Give a price and the pieces go straight into stock at their real
        # cost — the cloth plus what the unit charged to make them.
        sale_price = graphene.Float()
        return_transporter = graphene.String()
        return_lr_number = graphene.String()
        return_vehicle_number = graphene.String()
        return_photos = graphene.String()

    order = graphene.Field(JobworkOrderType)

    @login_required
    def mutate(self, info, id, sizes, **kwargs):
        return ReceiveJobwork(order=receive_jobwork(
            user=info.context.user, id=id, sizes=[dict(r) for r in sizes], **kwargs))


class PayJobwork(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        amount = graphene.Float(required=True)

    order = graphene.Field(JobworkOrderType)

    @login_required
    def mutate(self, info, id, amount):
        return PayJobwork(order=pay_jobwork(user=info.context.user, id=id, amount=amount))
