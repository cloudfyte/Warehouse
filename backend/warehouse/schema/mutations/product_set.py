import graphene
from graphql_jwt.decorators import login_required

from warehouse.services.product_set import (
    break_sets, build_sets, create_product_set, update_product_set,
)
from warehouse.schema.types import ProductSetType


class SetLineInput(graphene.InputObjectType):
    finished_product_id = graphene.ID(required=True)
    pieces_per_set = graphene.Int()


class CreateProductSet(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        item_type_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        lines = graphene.List(graphene.NonNull(SetLineInput), required=True)
        quantity = graphene.Int()
        cost_price = graphene.Float()
        sale_price = graphene.Float()
        notes = graphene.String()

    product_set = graphene.Field(ProductSetType)

    @login_required
    def mutate(self, info, lines, **kwargs):
        return CreateProductSet(product_set=create_product_set(
            user=info.context.user, lines=[dict(l) for l in lines], **kwargs))


class UpdateProductSet(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        cost_price = graphene.Float()
        sale_price = graphene.Float()
        active = graphene.Boolean()
        notes = graphene.String()
        lines = graphene.List(graphene.NonNull(SetLineInput))

    product_set = graphene.Field(ProductSetType)

    @login_required
    def mutate(self, info, id, lines=None, **kwargs):
        return UpdateProductSet(product_set=update_product_set(
            user=info.context.user, id=id,
            lines=[dict(l) for l in lines] if lines is not None else None, **kwargs))


class BuildProductSets(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        count = graphene.Int(required=True)

    product_set = graphene.Field(ProductSetType)

    @login_required
    def mutate(self, info, id, count):
        return BuildProductSets(product_set=build_sets(user=info.context.user, id=id, count=count))


class BreakProductSets(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        count = graphene.Int(required=True)

    product_set = graphene.Field(ProductSetType)

    @login_required
    def mutate(self, info, id, count):
        return BreakProductSets(product_set=break_sets(user=info.context.user, id=id, count=count))
