"""Sending stock from the godown to the retail shop.

The shop is one subsite over there, and this warehouse belongs to exactly one
of them. The rules worth holding to are all about counting once: stock leaves
this building once, and lands over there once.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, FinishedProduct, ItemType, RetailChannel, RetailDispatch,
    RetailProductLink, RetailStore, WarehouseLocation,
)
from warehouse.services.production import create_finished_products, update_finished_product
from warehouse.services.retail import (
    add_store, cancel_dispatch, configure_channel, create_dispatch, link_product,
    pack_dispatch, scan_into_dispatch, send_dispatch,
)


class RetailFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Godown", code="GD")
        self.item_type = ItemType.objects.create(name="Sherwani", active=True)
        self.channel = configure_channel(
            user=self.admin, subsite_id=7, subsite_name="sriweddings",
            api_url="https://example.invalid/graphql/")
        self.store = add_store(user=self.admin, building_id=11, name="Main Shop")

    def _product(self, quantity=10, cost=500, link=True):
        product = create_finished_products(
            user=self.admin, item_type_id=self.item_type.id,
            warehouse_id=self.warehouse.id, quantity=quantity,
            cost_price=cost, sale_price=cost * 2, size="40",
        )
        if link:
            link_product(user=self.admin,
                         finished_product_id=product.id, product_id=101, variant_id=202)
        return product

    def _dispatch(self, product, quantity=3):
        return create_dispatch(
            user=self.admin, store_id=self.store.id, warehouse_id=self.warehouse.id,
            lines=[{"finished_product_id": product.id, "quantity": quantity}],
        )

    def _scan(self, dispatch, product, times):
        for _ in range(times):
            scan_into_dispatch(user=self.admin, id=dispatch.id, barcode=product.barcode)


class TheSubsiteIsPinned(RetailFixture):
    def test_there_is_only_ever_one_channel(self):
        """A warehouse that can pick its destination subsite can push someone
        else's stock into someone else's shop."""
        configure_channel(user=self.admin, subsite_id=99, subsite_name="other",
                          api_url="https://elsewhere.invalid/graphql/")

        self.assertEqual(RetailChannel.objects.count(), 1)
        self.assertEqual(RetailChannel.objects.get().subsite_id, 99)

    def test_a_store_belongs_to_the_channel(self):
        self.assertEqual(self.store.channel_id, self.channel.pk)
        self.assertEqual(RetailStore.objects.count(), 1)

    def test_registering_the_same_store_twice_updates_it(self):
        add_store(user=self.admin, building_id=11, name="Main Shop — renamed")

        self.assertEqual(RetailStore.objects.count(), 1)
        self.assertEqual(RetailStore.objects.get().name, "Main Shop — renamed")


class StockLeavesWhenTheCartonCloses(RetailFixture):
    def test_drafting_a_consignment_moves_nothing(self):
        product = self._product(quantity=10)
        self._dispatch(product, quantity=3)

        product.refresh_from_db()
        self.assertEqual(product.quantity, 10)

    def test_packing_takes_the_stock_out_of_the_godown(self):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=3)
        self._scan(dispatch, product, 3)

        pack_dispatch(user=self.admin, id=dispatch.id)

        product.refresh_from_db()
        self.assertEqual(product.quantity, 7)

    def test_cancelling_a_packed_consignment_puts_the_stock_back(self):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=3)
        self._scan(dispatch, product, 3)
        pack_dispatch(user=self.admin, id=dispatch.id)

        cancel_dispatch(user=self.admin, id=dispatch.id)

        product.refresh_from_db()
        self.assertEqual(product.quantity, 10)

    def test_a_consignment_cannot_be_packed_twice(self):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=3)
        self._scan(dispatch, product, 3)
        pack_dispatch(user=self.admin, id=dispatch.id)

        with self.assertRaises(GraphQLError):
            pack_dispatch(user=self.admin, id=dispatch.id)

        product.refresh_from_db()
        self.assertEqual(product.quantity, 7)


class TheCartonIsScannedShut(RetailFixture):
    def test_a_short_carton_will_not_pack_by_accident(self):
        product = self._product()
        dispatch = self._dispatch(product, quantity=3)
        self._scan(dispatch, product, 2)

        with self.assertRaises(GraphQLError):
            pack_dispatch(user=self.admin, id=dispatch.id)

    def test_packing_short_on_purpose_sends_what_is_in_the_carton(self):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=3)
        self._scan(dispatch, product, 2)

        pack_dispatch(user=self.admin, id=dispatch.id, allow_short=True)

        product.refresh_from_db()
        self.assertEqual(product.quantity, 8)
        self.assertEqual(dispatch.items.get().quantity, 2)

    def test_a_garment_not_on_the_list_is_refused(self):
        product = self._product()
        other = self._product()
        dispatch = self._dispatch(product, quantity=1)

        with self.assertRaises(GraphQLError):
            scan_into_dispatch(user=self.admin, id=dispatch.id, barcode=other.barcode)

    def test_scanning_more_than_the_line_is_refused(self):
        product = self._product()
        dispatch = self._dispatch(product, quantity=1)
        self._scan(dispatch, product, 1)

        with self.assertRaises(GraphQLError):
            scan_into_dispatch(user=self.admin, id=dispatch.id, barcode=product.barcode)

    def test_a_retired_barcode_still_scans(self):
        """A reprice mints a new code and keeps the old one alive. Refusing the
        old one would reject stock that is genuinely on the list."""
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=1)
        old_code = product.barcode
        update_finished_product(user=self.admin, id=product.id, cost_price=650)
        product.refresh_from_db()
        self.assertNotEqual(product.barcode, old_code)

        item = scan_into_dispatch(user=self.admin, id=dispatch.id, barcode=old_code)

        self.assertEqual(item.packed_quantity, 1)


class NothingGoesWithoutACatalogueEntry(RetailFixture):
    def test_an_unlinked_product_blocks_the_consignment(self):
        product = self._product(link=False)
        dispatch = self._dispatch(product, quantity=1)
        self._scan(dispatch, product, 1)

        with self.assertRaises(GraphQLError) as caught:
            pack_dispatch(user=self.admin, id=dispatch.id)

        self.assertIn(product.sku, str(caught.exception))
        product.refresh_from_db()
        self.assertEqual(product.quantity, 10)

    def test_linking_is_one_row_per_product(self):
        product = self._product(link=False)
        link_product(user=self.admin, finished_product_id=product.id, product_id=1)
        link_product(user=self.admin, finished_product_id=product.id, product_id=2, variant_id=9)

        self.assertEqual(RetailProductLink.objects.filter(finished_product=product).count(), 1)
        link = RetailProductLink.objects.get(finished_product=product)
        self.assertEqual((link.product_id, link.variant_id), (2, 9))


class ItLandsOverThereExactlyOnce(RetailFixture):
    """The retail receipt endpoint has no idempotency key, so posting twice
    would add the stock twice with nothing to show it happened."""

    def _packed(self):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=3)
        self._scan(dispatch, product, 3)
        return product, pack_dispatch(user=self.admin, id=dispatch.id)

    def test_an_acknowledged_consignment_refuses_to_send_again(self):
        _, dispatch = self._packed()
        calls = []

        def transport(channel, query, variables):
            calls.append(variables)
            return {"recordStockReceipt": {"receipt": {"id": 555}}}

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)
        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.ACKNOWLEDGED)
        self.assertEqual(dispatch.receipt_id, 555)

        with self.assertRaises(GraphQLError):
            send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(len(calls), 1)

    def test_the_call_carries_the_pinned_subsite_and_the_consignment_number(self):
        _, dispatch = self._packed()
        seen = {}

        def transport(channel, query, variables):
            seen.update(variables)
            return {"recordStockReceipt": {"receipt": {"id": 1}}}

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(seen["hms"], 7)
        self.assertEqual(seen["building"], 11)
        self.assertIn(dispatch.dispatch_number, seen["notes"])
        self.assertEqual(seen["items"], [{"quantity": 3, "unitCost": 500.0, "variantId": 202}])

    def test_a_failed_send_parks_for_a_human_and_keeps_the_stock_out(self):
        product, dispatch = self._packed()

        def transport(channel, query, variables):
            raise RuntimeError("Could not reach the shop: timed out.")

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        dispatch.refresh_from_db()
        product.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.FAILED)
        self.assertIn("timed out", dispatch.last_error)
        # The lorry has gone whether or not the API call worked.
        self.assertEqual(product.quantity, 7)

    def test_a_failed_send_can_be_retried_and_then_lands_once(self):
        _, dispatch = self._packed()
        calls = []

        def failing(channel, query, variables):
            calls.append(variables)
            raise RuntimeError("boom")

        def working(channel, query, variables):
            calls.append(variables)
            return {"recordStockReceipt": {"receipt": {"id": 77}}}

        send_dispatch(user=self.admin, id=dispatch.id, _transport=failing)
        send_dispatch(user=self.admin, id=dispatch.id, _transport=working)

        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.ACKNOWLEDGED)
        self.assertEqual(dispatch.receipt_id, 77)
        self.assertEqual(len(calls), 2)
        # Same consignment number both times, so the shop can spot a repeat.
        self.assertEqual(calls[0]["notes"], calls[1]["notes"])

    def test_a_sent_consignment_cannot_be_cancelled(self):
        _, dispatch = self._packed()
        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 3}}})

        with self.assertRaises(GraphQLError):
            cancel_dispatch(user=self.admin, id=dispatch.id)


class ADeliveredBarcodeIsFrozen(RetailFixture):
    """Over there the barcode is a single column with no history, so a re-mint
    leaves the shop holding tags their own till cannot scan."""

    def test_repricing_after_delivery_keeps_the_code(self):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=1)
        self._scan(dispatch, product, 1)
        pack_dispatch(user=self.admin, id=dispatch.id)
        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 9}}})
        before = product.barcode

        update_finished_product(user=self.admin, id=product.id, cost_price=999)

        product.refresh_from_db()
        self.assertEqual(product.barcode, before)
        self.assertEqual(product.cost_price, Decimal("999.00"))

    def test_repricing_before_delivery_still_mints_a_new_code(self):
        product = self._product(quantity=10)
        before = product.barcode

        update_finished_product(user=self.admin, id=product.id, cost_price=999)

        product.refresh_from_db()
        self.assertNotEqual(product.barcode, before)
        self.assertIn(before, product.past_codes())


class TheShopsOwnListsAreFetched(RetailFixture):
    """Store ids and product ids belong to the shop and differ between their
    test site and their real one. Typed by hand, they put a consignment in the
    wrong shop or against the wrong garment."""

    def test_pulling_stores_adds_them_without_anyone_typing_an_id(self):
        from warehouse.services.retail import pull_stores

        def transport(channel, query, variables):
            self.assertEqual(variables["company"], 7)
            return {"listBuildings": [
                {"id": 21, "name": "Studio", "location": "", "propertyType": "store"},
                {"id": 22, "name": "Retail Store", "location": "", "propertyType": "store"},
            ]}

        pull_stores(user=self.admin, _transport=transport)

        names = set(RetailStore.objects.filter(active=True).values_list("name", flat=True))
        self.assertEqual(names, {"Studio", "Retail Store"})

    def test_a_store_that_disappears_is_deactivated_not_deleted(self):
        """Consignments already sent to it still have to name where they went."""
        from warehouse.services.retail import pull_stores

        pull_stores(user=self.admin, _transport=lambda c, q, v: {
            "listBuildings": [{"id": 21, "name": "Studio"}]})
        pull_stores(user=self.admin, _transport=lambda c, q, v: {"listBuildings": []})

        studio = RetailStore.objects.get(building_id=21)
        self.assertFalse(studio.active)
        self.assertEqual(studio.name, "Studio")

    def test_barcodes_that_agree_are_linked_without_a_decision(self):
        from warehouse.services.retail import pull_catalogue

        product = self._product(link=False)

        linked, unmatched = pull_catalogue(user=self.admin, _transport=lambda c, q, v: {
            "listProducts": [{
                "id": 5, "name": "Sherwani", "isActive": True, "hasVariants": True,
                "variants": [{"id": 9, "barcode": product.barcode, "isActive": True}],
            }]})

        self.assertEqual([p.id for p in linked], [product.id])
        self.assertEqual(unmatched, [])
        link = RetailProductLink.objects.get(finished_product=product)
        self.assertEqual((link.product_id, link.variant_id), (5, 9))

    def test_a_barcode_they_reused_is_too_ambiguous_to_match_on(self):
        """A wrong link sends the right garment against the wrong product, and
        nobody finds out until the stock is counted."""
        from warehouse.services.retail import pull_catalogue

        product = self._product(link=False)

        linked, unmatched = pull_catalogue(user=self.admin, _transport=lambda c, q, v: {
            "listProducts": [
                {"id": 5, "name": "A", "variants": [{"id": 9, "barcode": product.barcode}]},
                {"id": 6, "name": "B", "variants": [{"id": 10, "barcode": product.barcode}]},
            ]})

        self.assertEqual(linked, [])
        self.assertEqual([p.id for p in unmatched], [product.id])

    def test_an_old_tag_still_on_their_shelf_matches(self):
        from warehouse.services.retail import pull_catalogue

        product = self._product(quantity=5, link=False)
        old_code = product.barcode
        update_finished_product(user=self.admin, id=product.id, cost_price=777)
        product.refresh_from_db()

        linked, _ = pull_catalogue(user=self.admin, _transport=lambda c, q, v: {
            "listProducts": [{"id": 5, "name": "S",
                              "variants": [{"id": 9, "barcode": old_code}]}]})

        self.assertEqual([p.id for p in linked], [product.id])

    def test_an_already_linked_product_is_left_alone(self):
        from warehouse.services.retail import pull_catalogue

        product = self._product()  # linked to 101/202 in the fixture

        linked, unmatched = pull_catalogue(user=self.admin, _transport=lambda c, q, v: {
            "listProducts": [{"id": 5, "name": "S",
                              "variants": [{"id": 9, "barcode": product.barcode}]}]})

        self.assertEqual(linked, [])
        self.assertEqual(unmatched, [])
        self.assertEqual(RetailProductLink.objects.get(finished_product=product).product_id, 101)
