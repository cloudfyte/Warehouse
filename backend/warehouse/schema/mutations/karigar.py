import graphene
from graphql_jwt.decorators import login_required

from warehouse.services.karigar import create_karigar, pay_karigar, update_karigar
from warehouse.schema.types import KarigarType, StitchingJobType


class CreateKarigar(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        kind = graphene.String()
        rate_per_piece = graphene.Float()
        phone = graphene.String()
        whatsapp = graphene.String()
        city = graphene.String()
        address = graphene.String()
        notes = graphene.String()

    karigar = graphene.Field(KarigarType)

    @login_required
    def mutate(self, info, **kwargs):
        return CreateKarigar(karigar=create_karigar(user=info.context.user, **kwargs))


class UpdateKarigar(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        kind = graphene.String()
        rate_per_piece = graphene.Float()
        phone = graphene.String()
        whatsapp = graphene.String()
        city = graphene.String()
        address = graphene.String()
        notes = graphene.String()
        active = graphene.Boolean()

    karigar = graphene.Field(KarigarType)

    @login_required
    def mutate(self, info, id, **kwargs):
        return UpdateKarigar(karigar=update_karigar(user=info.context.user, id=id, **kwargs))


class PayKarigar(graphene.Mutation):
    """Record money paid against one stitching job."""
    class Arguments:
        stitching_job_id = graphene.ID(required=True)
        amount = graphene.Float(required=True)

    job = graphene.Field(StitchingJobType)

    @login_required
    def mutate(self, info, stitching_job_id, amount):
        return PayKarigar(job=pay_karigar(
            user=info.context.user, stitching_job_id=stitching_job_id, amount=amount))
