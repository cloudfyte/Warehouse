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


class TheShopGainsTheGarmentWhenItIsSent(RetailFixture):
    """The warehouse and the shop are one business, so a garment leaving here
    arrives there under the barcode already printed on its tag."""

    def _shop(self, catalogue=None, created=None):
        """A stand-in shop that records what it was asked to do."""
        calls = {"created": [], "receipts": []}

        def transport(channel, query, variables):
            if "listProducts" in query:
                return {"listProducts": catalogue or []}
            if "createProduct" in query:
                calls["created"].append(variables)
                return {"createProduct": {
                    "success": True, "message": "Product created",
                    "product": {"id": created or 9001,
                                "name": variables["name"],
                                "barcode": variables["barcode"]}}}
            calls["receipts"].append(variables)
            return {"recordStockReceipt": {"receipt": {"id": 777}}}

        return transport, calls

    def _packed_unlinked(self):
        product = self._product(link=False)
        dispatch = self._dispatch(product, quantity=1)
        self._scan(dispatch, product, 1)
        return product, pack_dispatch(user=self.admin, id=dispatch.id)

    def test_a_garment_the_shop_has_never_seen_is_created_there(self):
        product, dispatch = self._packed_unlinked()
        transport, calls = self._shop()

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(len(calls["created"]), 1)
        self.assertEqual(calls["created"][0]["barcode"], product.barcode)
        self.assertEqual(calls["created"][0]["hms"], 7)
        self.assertEqual(calls["created"][0]["price"], float(product.sale_price))
        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.ACKNOWLEDGED)

    def test_the_barcode_survives_the_crossing(self):
        """The code is on the tag hanging off the piece. A second one minted
        over there means a scan at their counter finds nothing."""
        product, dispatch = self._packed_unlinked()
        transport, calls = self._shop()

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        link = RetailProductLink.objects.get(finished_product=product)
        self.assertEqual(link.product_id, 9001)
        self.assertEqual(calls["created"][0]["barcode"], product.barcode)
        self.assertEqual(calls["receipts"][0]["items"][0]["productId"], 9001)

    def test_a_garment_already_on_their_shelf_is_matched_not_duplicated(self):
        product, dispatch = self._packed_unlinked()
        transport, calls = self._shop(catalogue=[{
            "id": 55, "name": "Kurta", "barcode": product.barcode,
            "isActive": True, "hasVariants": False, "variants": [],
        }])

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(calls["created"], [])
        link = RetailProductLink.objects.get(finished_product=product)
        self.assertEqual((link.product_id, link.variant_id), (55, None))

    def test_a_variant_barcode_matches_the_variant(self):
        product, dispatch = self._packed_unlinked()
        transport, calls = self._shop(catalogue=[{
            "id": 55, "name": "Kurta", "barcode": "", "isActive": True,
            "hasVariants": True,
            "variants": [{"id": 88, "sku": "K-40", "barcode": product.barcode,
                          "price": 900, "isActive": True, "label": "40",
                          "options": [], "storeStocks": []}],
        }])

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(calls["created"], [])
        self.assertEqual(calls["receipts"][0]["items"][0]["variantId"], 88)

    def test_sending_twice_does_not_create_it_twice(self):
        product, dispatch = self._packed_unlinked()
        transport, calls = self._shop()

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)
        with self.assertRaises(GraphQLError):
            send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(len(calls["created"]), 1)

    def test_a_shop_that_refuses_the_garment_parks_the_consignment(self):
        product, dispatch = self._packed_unlinked()

        def transport(channel, query, variables):
            if "listProducts" in query:
                return {"listProducts": []}
            if "createProduct" in query:
                return {"createProduct": {"success": False,
                                          "message": "No such subsite.",
                                          "product": None}}
            raise AssertionError("nothing should be sent after a refusal")

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.FAILED)
        self.assertIn("No such subsite.", dispatch.last_error)
        self.assertFalse(RetailProductLink.objects.filter(finished_product=product).exists())

    def test_packing_does_not_wait_on_the_shop(self):
        """Closing the carton is a thing that happens in the godown."""
        product, dispatch = self._packed_unlinked()

        self.assertEqual(dispatch.status, RetailDispatch.Status.PACKED)
        product.refresh_from_db()
        self.assertEqual(product.quantity, 9)

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


class TheSubsiteIsLookedUpNotTyped(RetailFixture):
    """The handle is stable; the number is not. The same shop is a different id
    on their test site and their real one, and a mistyped one points a whole
    warehouse at somebody else's business."""

    def test_the_handle_resolves_to_the_id(self):
        from warehouse.services.retail import resolve_subsite

        channel = resolve_subsite(
            user=self.admin, subsite_name="sriweddings",
            api_url="https://example.invalid/graphql/",
            _transport=lambda c, q, v: {"listHms": [
                {"id": 3, "hmsName": "kondagattufoods"},
                {"id": 12, "hmsName": "sriweddings"},
            ]})

        self.assertEqual(channel.subsite_id, 12)
        self.assertEqual(channel.subsite_name, "sriweddings")

    def test_a_handle_the_login_cannot_see_is_refused_with_what_it_can(self):
        from warehouse.services.retail import resolve_subsite

        with self.assertRaises(GraphQLError) as caught:
            resolve_subsite(user=self.admin, subsite_name="sriweddings",
                            api_url="https://example.invalid/graphql/",
                            _transport=lambda c, q, v: {"listHms": [
                                {"id": 3, "hmsName": "kondagattufoods"}]})

        self.assertIn("kondagattufoods", str(caught.exception))


class GoodsComeBackFromTheShop(RetailFixture):
    def _delivered(self, quantity=5, send=3):
        product = self._product(quantity=quantity)
        dispatch = self._dispatch(product, quantity=send)
        self._scan(dispatch, product, send)
        pack_dispatch(user=self.admin, id=dispatch.id)
        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 1}}})
        return product

    def test_a_return_puts_the_stock_back_in_the_godown(self):
        from warehouse.services.retail import create_return

        product = self._delivered(quantity=5, send=3)
        product.refresh_from_db()
        self.assertEqual(product.quantity, 2)

        create_return(user=self.admin, store_id=self.store.id,
                      warehouse_id=self.warehouse.id,
                      lines=[{"finished_product_id": product.id, "quantity": 2}])

        product.refresh_from_db()
        self.assertEqual(product.quantity, 4)

    def test_damaged_goods_are_recorded_but_not_restocked(self):
        from warehouse.services.retail import create_return

        product = self._delivered(quantity=5, send=3)

        ret = create_return(user=self.admin, store_id=self.store.id,
                            warehouse_id=self.warehouse.id, reason="DAMAGED", restock=False,
                            lines=[{"finished_product_id": product.id, "quantity": 2}])

        product.refresh_from_db()
        self.assertEqual(product.quantity, 2)
        self.assertEqual(ret.items.get().quantity, 2)


class DriftIsMadeVisible(RetailFixture):
    """Two systems holding the same stock always drift. The only question is
    whether anybody finds out."""

    def _delivered_and_acked(self, send=10):
        product = self._product(quantity=20)
        dispatch = self._dispatch(product, quantity=send)
        self._scan(dispatch, product, send)
        pack_dispatch(user=self.admin, id=dispatch.id)
        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 1}}})
        return product

    def _shop_says(self, quantity):
        return lambda c, q, v: {"listProducts": [{
            "id": 101, "name": "Sherwani",
            "variants": [{"id": 202, "storeStocks": [
                {"buildingId": 11, "stockQuantity": quantity}]}],
        }]}

    def test_it_reports_what_we_sent_against_what_the_shop_holds(self):
        from warehouse.services.retail import reconcile

        product = self._delivered_and_acked(send=10)

        rows = reconcile(user=self.admin, store_id=self.store.id,
                         _transport=self._shop_says(8))

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["finished_product"].id, product.id)
        self.assertEqual((row["sent"], row["net_sent"], row["shop_has"]), (10, 10, 8))
        self.assertEqual(row["difference"], -2)

    def test_a_return_is_taken_off_what_the_shop_should_be_holding(self):
        from warehouse.services.retail import create_return, reconcile

        product = self._delivered_and_acked(send=10)
        create_return(user=self.admin, store_id=self.store.id,
                      warehouse_id=self.warehouse.id,
                      lines=[{"finished_product_id": product.id, "quantity": 4}])

        rows = reconcile(user=self.admin, store_id=self.store.id,
                         _transport=self._shop_says(6))

        row = rows[0]
        self.assertEqual((row["sent"], row["returned"], row["net_sent"]), (10, 4, 6))
        self.assertEqual(row["difference"], 0)

    def test_a_consignment_still_in_the_van_is_not_counted(self):
        """Counting it would report a shortfall that is a lorry in traffic."""
        from warehouse.services.retail import reconcile

        product = self._product(quantity=20)
        dispatch = self._dispatch(product, quantity=5)
        self._scan(dispatch, product, 5)
        pack_dispatch(user=self.admin, id=dispatch.id)  # packed, never sent

        rows = reconcile(user=self.admin, store_id=self.store.id,
                         _transport=self._shop_says(0))

        self.assertEqual(rows, [])

    def test_an_unlimited_item_reads_as_unknown_not_as_zero(self):
        from warehouse.services.retail import reconcile

        self._delivered_and_acked(send=10)

        rows = reconcile(user=self.admin, store_id=self.store.id,
                         _transport=self._shop_says(None))

        self.assertIsNone(rows[0]["shop_has"])
        self.assertIsNone(rows[0]["difference"])


class EveryMovementIsOnOneRegister(RetailFixture):
    """"we need to have complete record which product we moved on which date
    and quantity and whom did that" — one list, read off the records that
    already exist rather than a second copy that can disagree with the stock."""

    def _sent(self, quantity=3):
        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=quantity)
        self._scan(dispatch, product, quantity)
        pack_dispatch(user=self.admin, id=dispatch.id)
        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 42}}})
        return product, dispatch

    def test_a_consignment_shows_what_went_when_and_who_sent_it(self):
        from warehouse.selectors import get_stock_movements

        product, dispatch = self._sent(quantity=3)

        row = next(r for r in get_stock_movements(self.admin)
                   if r["reference"] == dispatch.dispatch_number)
        self.assertEqual(row["kind"], "TO_SHOP")
        self.assertEqual(row["product"].id, product.id)
        self.assertEqual(row["quantity"], 3)
        self.assertEqual(row["person"], self.admin.username)
        self.assertEqual(row["to_name"], self.store.name)
        self.assertEqual(row["from_name"], self.warehouse.name)
        self.assertIsNotNone(row["when"])

    def test_it_names_the_hand_that_sent_it_not_the_one_that_wrote_it(self):
        from warehouse.models import EmployeeProfile
        from django.contrib.auth.models import User
        from warehouse.selectors import get_stock_movements

        packer = User.objects.create_user("packer", password="x")
        profile = EmployeeProfile.objects.create(
            user=packer, role=EmployeeProfile.Role.STORE_KEEPER, active=True)
        profile.locations.add(self.warehouse)

        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=2)
        self._scan(dispatch, product, 2)
        pack_dispatch(user=packer, id=dispatch.id)
        send_dispatch(user=packer, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 43}}})

        row = next(r for r in get_stock_movements(self.admin)
                   if r["reference"] == dispatch.dispatch_number)
        self.assertEqual(row["person"], "packer")

    def test_goods_coming_back_are_on_the_same_register(self):
        from warehouse.selectors import get_stock_movements
        from warehouse.services.retail import create_return

        product, _ = self._sent(quantity=3)
        returned = create_return(
            user=self.admin, store_id=self.store.id, warehouse_id=self.warehouse.id,
            lines=[{"finished_product_id": product.id, "quantity": 2}], reason="UNSOLD")

        row = next(r for r in get_stock_movements(self.admin)
                   if r["reference"] == returned.return_number)
        self.assertEqual(row["kind"], "BACK_FROM_SHOP")
        self.assertEqual(row["quantity"], 2)
        self.assertEqual(row["from_name"], self.store.name)

    def test_a_cancelled_consignment_is_not_a_movement(self):
        from warehouse.selectors import get_stock_movements
        from warehouse.services.retail import cancel_dispatch

        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=3)
        cancel_dispatch(user=self.admin, id=dispatch.id)

        references = [r["reference"] for r in get_stock_movements(self.admin)]
        self.assertNotIn(dispatch.dispatch_number, references)

    def test_one_garment_can_be_asked_for_its_own_history(self):
        from warehouse.selectors import get_stock_movements

        product, dispatch = self._sent(quantity=3)
        other = self._product(quantity=5)
        second = self._dispatch(other, quantity=1)
        self._scan(second, other, 1)
        pack_dispatch(user=self.admin, id=second.id)

        rows = get_stock_movements(self.admin, product_id=product.id)
        self.assertEqual([r["reference"] for r in rows], [dispatch.dispatch_number])

    def test_the_newest_movement_comes_first(self):
        from warehouse.selectors import get_stock_movements

        _, first = self._sent(quantity=1)
        _, second = self._sent(quantity=1)

        references = [r["reference"] for r in get_stock_movements(self.admin)]
        self.assertLess(references.index(second.dispatch_number),
                        references.index(first.dispatch_number))


class NothingGoesToTheShopUnpriced(RetailFixture):
    """A bought-in garment arrives priced at what it cost, as a placeholder.
    Sent like that, the shop sells it for no margin."""

    def test_a_garment_still_at_cost_is_refused(self):
        from warehouse.services.production import update_finished_product

        product = self._product(quantity=10, cost=500)
        update_finished_product(user=self.admin, id=product.id, sale_price=500)
        dispatch = self._dispatch(product, quantity=2)
        self._scan(dispatch, product, 2)
        pack_dispatch(user=self.admin, id=dispatch.id)

        with self.assertRaises(GraphQLError) as caught:
            send_dispatch(user=self.admin, id=dispatch.id,
                          _transport=lambda c, q, v: {})

        self.assertIn(product.sku, str(caught.exception))
        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.PACKED)

    def test_a_deliberate_markdown_is_allowed_through(self):
        """Selling below cost is somebody's decision, not a mistake to block."""
        from warehouse.services.production import update_finished_product

        product = self._product(quantity=10, cost=500)
        update_finished_product(user=self.admin, id=product.id, sale_price=400)
        dispatch = self._dispatch(product, quantity=2)
        self._scan(dispatch, product, 2)
        pack_dispatch(user=self.admin, id=dispatch.id)

        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 99}}})

        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, RetailDispatch.Status.ACKNOWLEDGED)


class TheConsignmentSaysWhoDidWhat(RetailFixture):
    """A foreign key to a user is not exposed on its own, so a consignment that
    records three hands can still show none of them."""

    def test_every_hand_is_readable_on_the_consignment(self):
        from warehouse.schema.types import RetailDispatchType

        for field in ("created_by", "packed_by", "sent_by"):
            self.assertIn(field, RetailDispatchType._meta.fields, field)
            self.assertTrue(hasattr(RetailDispatchType, f"resolve_{field}"), field)

    def test_the_names_come_back_through_the_schema(self):
        from config.schema import schema

        product = self._product(quantity=10)
        dispatch = self._dispatch(product, quantity=2)
        self._scan(dispatch, product, 2)
        pack_dispatch(user=self.admin, id=dispatch.id)
        send_dispatch(user=self.admin, id=dispatch.id,
                      _transport=lambda c, q, v: {"recordStockReceipt": {"receipt": {"id": 7}}})

        class Ctx:
            pass
        ctx = Ctx()
        ctx.user = self.admin
        result = schema.execute(
            "{ retailDispatches { dispatchNumber packedBy { username } sentBy { username } } }",
            context=ctx)

        self.assertIsNone(result.errors)
        row = next(r for r in result.data["retailDispatches"]
                   if r["dispatchNumber"] == dispatch.dispatch_number)
        self.assertEqual(row["packedBy"]["username"], self.admin.username)
        self.assertEqual(row["sentBy"]["username"], self.admin.username)


class OneCodeOnBothCounters(RetailFixture):
    """The barcode has to be the same thing through the whole crossing —
    created with it, matched on it, and stamped onto a hand-made entry that
    never had one."""

    def _packed_unlinked(self):
        product = self._product(link=False)
        dispatch = self._dispatch(product, quantity=1)
        self._scan(dispatch, product, 1)
        return product, pack_dispatch(user=self.admin, id=dispatch.id)

    def _shop(self, catalogue):
        calls = {"created": [], "stamped": [], "receipts": []}

        def transport(channel, query, variables):
            if "listProducts" in query:
                return {"listProducts": catalogue}
            if "createProduct" in query:
                calls["created"].append(variables)
                return {"createProduct": {"success": True, "message": "",
                                          "product": {"id": 9001, "name": variables["name"],
                                                      "barcode": variables["barcode"]}}}
            if "updateProduct" in query:
                calls["stamped"].append(variables)
                return {"updateProduct": {"success": True, "message": "",
                                          "product": {"id": variables["id"],
                                                      "barcode": variables["barcode"]}}}
            calls["receipts"].append(variables)
            return {"recordStockReceipt": {"receipt": {"id": 321}}}

        return transport, calls

    def test_a_hand_made_entry_with_no_code_gets_ours(self):
        product, dispatch = self._packed_unlinked()
        # Somebody added it over there by hand: right name, no barcode.
        shop_name = product.item_type.name
        transport, calls = self._shop([{
            "id": 77, "name": f"{shop_name} · 40", "barcode": "",
            "isActive": True, "hasVariants": False, "variants": [],
        }])

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(calls["created"], [], "it already existed — nothing to create")
        self.assertEqual(len(calls["stamped"]), 1)
        self.assertEqual(calls["stamped"][0]["barcode"], product.barcode)
        self.assertEqual(calls["stamped"][0]["id"], 77)
        link = RetailProductLink.objects.get(finished_product=product)
        self.assertEqual(link.product_id, 77)
        self.assertEqual(calls["receipts"][0]["items"][0]["productId"], 77)

    def test_a_code_they_chose_is_never_overwritten(self):
        """Theirs may be printed on something. Ours goes on a blank only."""
        product, dispatch = self._packed_unlinked()
        shop_name = product.item_type.name
        transport, calls = self._shop([{
            "id": 77, "name": f"{shop_name} · 40", "barcode": "THEIRS-123",
            "isActive": True, "hasVariants": False, "variants": [],
        }])

        send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(calls["stamped"], [])
        self.assertEqual(len(calls["created"]), 1)
        self.assertEqual(calls["created"][0]["barcode"], product.barcode)

    def test_sending_again_adds_to_what_is_there(self):
        """Their side increments; ours must send against the same product."""
        product = self._product(quantity=20)
        transport, calls = self._shop([])

        for _ in range(2):
            dispatch = self._dispatch(product, quantity=2)
            self._scan(dispatch, product, 2)
            pack_dispatch(user=self.admin, id=dispatch.id)
            send_dispatch(user=self.admin, id=dispatch.id, _transport=transport)

        self.assertEqual(len(calls["receipts"]), 2)
        ids = {r["items"][0].get("variantId") or r["items"][0].get("productId")
               for r in calls["receipts"]}
        self.assertEqual(len(ids), 1, "both consignments must land on one product")
        self.assertEqual(RetailProductLink.objects.filter(finished_product=product).count(), 1)
