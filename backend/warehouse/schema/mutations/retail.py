import graphene
from graphql_jwt.decorators import login_required

from warehouse.services.retail import (
    add_store, cancel_dispatch, configure_channel, create_dispatch, link_product,
    pack_dispatch, scan_into_dispatch, send_dispatch, unlink_product,
)
from warehouse.schema.types import (
    RetailChannelType, RetailDispatchItemType, RetailDispatchType,
    RetailProductLinkType, RetailStoreType,
)


class ConfigureRetailChannel(graphene.Mutation):
    """Point this warehouse at its one retail subsite."""
    class Arguments:
        subsite_id = graphene.Int(required=True)
        subsite_name = graphene.String(required=True)
        api_url = graphene.String(required=True)
        service_username = graphene.String()
        # Blank leaves the stored one alone — the same rule the mail and
        # messaging credentials follow.
        service_password = graphene.String()
        active = graphene.Boolean()

    channel = graphene.Field(RetailChannelType)

    @login_required
    def mutate(self, info, **kwargs):
        return ConfigureRetailChannel(
            channel=configure_channel(user=info.context.user, **kwargs))


class AddRetailStore(graphene.Mutation):
    class Arguments:
        building_id = graphene.Int(required=True)
        name = graphene.String(required=True)

    store = graphene.Field(RetailStoreType)

    @login_required
    def mutate(self, info, building_id, name):
        return AddRetailStore(store=add_store(
            user=info.context.user, building_id=building_id, name=name))


class LinkRetailProduct(graphene.Mutation):
    class Arguments:
        finished_product_id = graphene.ID(required=True)
        product_id = graphene.Int(required=True)
        variant_id = graphene.Int()

    link = graphene.Field(RetailProductLinkType)

    @login_required
    def mutate(self, info, **kwargs):
        return LinkRetailProduct(link=link_product(user=info.context.user, **kwargs))


class UnlinkRetailProduct(graphene.Mutation):
    class Arguments:
        finished_product_id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, finished_product_id):
        return UnlinkRetailProduct(ok=unlink_product(
            user=info.context.user, finished_product_id=finished_product_id))


class DispatchLineInput(graphene.InputObjectType):
    finished_product_id = graphene.ID(required=True)
    quantity = graphene.Int(required=True)


class CreateRetailDispatch(graphene.Mutation):
    class Arguments:
        store_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        lines = graphene.List(graphene.NonNull(DispatchLineInput), required=True)
        dispatch_date = graphene.Date()
        notes = graphene.String()
        transporter_name = graphene.String()
        lr_number = graphene.String()
        vehicle_number = graphene.String()
        driver_phone = graphene.String()
        photos = graphene.String()

    dispatch = graphene.Field(RetailDispatchType)

    @login_required
    def mutate(self, info, lines, **kwargs):
        return CreateRetailDispatch(dispatch=create_dispatch(
            user=info.context.user, lines=[dict(l) for l in lines], **kwargs))


class ScanIntoRetailDispatch(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        barcode = graphene.String(required=True)

    item = graphene.Field(RetailDispatchItemType)

    @login_required
    def mutate(self, info, id, barcode):
        return ScanIntoRetailDispatch(item=scan_into_dispatch(
            user=info.context.user, id=id, barcode=barcode))


class PackRetailDispatch(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        allow_short = graphene.Boolean()

    dispatch = graphene.Field(RetailDispatchType)

    @login_required
    def mutate(self, info, id, allow_short=False):
        return PackRetailDispatch(dispatch=pack_dispatch(
            user=info.context.user, id=id, allow_short=allow_short))


class SendRetailDispatch(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    dispatch = graphene.Field(RetailDispatchType)

    @login_required
    def mutate(self, info, id):
        return SendRetailDispatch(dispatch=send_dispatch(user=info.context.user, id=id))


class CancelRetailDispatch(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    dispatch = graphene.Field(RetailDispatchType)

    @login_required
    def mutate(self, info, id):
        return CancelRetailDispatch(dispatch=cancel_dispatch(user=info.context.user, id=id))
