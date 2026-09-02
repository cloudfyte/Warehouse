"""Sets hold pieces; breaking one gives them back.

Every case is a conservation check: pieces move between individual stock and
built sets, and the total never changes.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    Buyer, EmployeeProfile, FinishedProduct, ItemType, ProductSet, SalesOrder,
    WarehouseLocation,
)
from warehouse.services.product_set import (
    break_sets, build_sets, create_product_set, update_product_set,
)


class SetFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        profile = EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        profile.locations.add(self.warehouse)
        self.item_type = ItemType.objects.create(name="Sherwani", active=True)

        # One product per size, ten pieces of each.
        self.sizes = ["38", "40", "42"]
        self.products = [self._product(size) for size in self.sizes]

    def _product(self, size, quantity=10):
        return FinishedProduct.objects.create(
            item_type=self.item_type, size=size,
            source=FinishedProduct.Source.IMPORTED,
            quantity=quantity, warehouse=self.warehouse,
            cost_price=Decimal("500.00"), sale_price=Decimal("1200.00"),
        )

    def _lines(self, per_set=1):
        return [{"finished_product_id": p.id, "pieces_per_set": per_set} for p in self.products]

    def _set(self, quantity=0, per_set=1):
        return create_product_set(
            user=self.admin, name="Sherwani set 38-42",
            item_type_id=self.item_type.id, warehouse_id=self.warehouse.id,
            lines=self._lines(per_set), quantity=quantity)

    def _pieces_loose(self):
        return sum(FinishedProduct.objects.get(pk=p.pk).quantity for p in self.products)


class BuildingAndBreaking(SetFixture):
    def test_building_takes_the_pieces_out_of_individual_stock(self):
        product_set = self._set(quantity=4)

        self.assertEqual(product_set.quantity, 4)
        for product in self.products:
            product.refresh_from_db()
            self.assertEqual(product.quantity, 6)          # 10 - 4

    def test_breaking_puts_every_piece_back(self):
        product_set = self._set(quantity=4)

        break_sets(user=self.admin, id=product_set.id, count=3)

        product_set.refresh_from_db()
        self.assertEqual(product_set.quantity, 1)
        for product in self.products:
            product.refresh_from_db()
            self.assertEqual(product.quantity, 9)          # 6 + 3

    def test_pieces_are_conserved_across_a_build_and_break(self):
        before = self._pieces_loose()
        product_set = self._set(quantity=5)
        build_sets(user=self.admin, id=product_set.id, count=2)
        break_sets(user=self.admin, id=product_set.id, count=7)

        product_set.refresh_from_db()
        self.assertEqual(product_set.quantity, 0)
        self.assertEqual(self._pieces_loose(), before)

    def test_a_set_can_hold_more_than_one_of_a_size(self):
        """Not a fixed one per size — a run might double up in the middle."""
        product_set = self._set(quantity=2, per_set=3)

        for product in self.products:
            product.refresh_from_db()
            self.assertEqual(product.quantity, 4)          # 10 - (3 x 2)

    def test_building_more_than_the_pieces_allow_is_refused(self):
        product_set = self._set()

        with self.assertRaises(GraphQLError):
            build_sets(user=self.admin, id=product_set.id, count=11)

        product_set.refresh_from_db()
        self.assertEqual(product_set.quantity, 0)
        self.assertEqual(self._pieces_loose(), 30, "a refused build must take nothing")

    def test_breaking_more_sets_than_exist_is_refused(self):
        product_set = self._set(quantity=2)

        with self.assertRaises(GraphQLError):
            break_sets(user=self.admin, id=product_set.id, count=3)

        product_set.refresh_from_db()
        self.assertEqual(product_set.quantity, 2)

    def test_a_set_prices_itself_from_its_members_by_default(self):
        product_set = self._set()

        self.assertEqual(product_set.cost_price, Decimal("1500.00"))    # 3 x 500
        self.assertEqual(product_set.sale_price, Decimal("3600.00"))    # 3 x 1200

    def test_a_set_gets_a_barcode_of_the_same_shape_as_a_garment(self):
        product_set = self._set()

        self.assertTrue(product_set.barcode.isdigit())
        self.assertTrue(product_set.barcode_svg)

    def test_the_make_up_cannot_change_while_sets_are_built(self):
        """Otherwise the pieces already inside them would be silently restated."""
        product_set = self._set(quantity=1)

        with self.assertRaises(GraphQLError):
            update_product_set(user=self.admin, id=product_set.id,
                               lines=[{"finished_product_id": self.products[0].id, "pieces_per_set": 1}])

    def test_the_make_up_can_change_once_they_are_broken(self):
        product_set = self._set(quantity=1)
        break_sets(user=self.admin, id=product_set.id, count=1)

        update_product_set(user=self.admin, id=product_set.id,
                           lines=[{"finished_product_id": self.products[0].id, "pieces_per_set": 2}])

        product_set.refresh_from_db()
        self.assertEqual(product_set.items.count(), 1)
        self.assertEqual(product_set.items.first().pieces_per_set, 2)

    def test_a_product_listed_twice_is_refused(self):
        with self.assertRaises(GraphQLError):
            create_product_set(
                user=self.admin, name="Bad set", item_type_id=self.item_type.id,
                warehouse_id=self.warehouse.id,
                lines=[{"finished_product_id": self.products[0].id, "pieces_per_set": 1},
                       {"finished_product_id": self.products[0].id, "pieces_per_set": 1}])


class SellingASet(SetFixture):
    def setUp(self):
        super().setUp()
        self.buyer = Buyer.objects.create(name="Shop", active=True)

    def test_selling_a_set_takes_only_from_the_set(self):
        """The pieces left individual stock when the set was built."""
        from warehouse.services.sales import create_sales_order

        product_set = self._set(quantity=4)
        loose_before = self._pieces_loose()

        create_sales_order(
            user=self.admin, buyer_id=self.buyer.id,
            payment_mode=SalesOrder.PaymentMode.PAID,
            warehouse_id=self.warehouse.id,
            items=[{"product_set_id": product_set.id, "quantity": 2,
                    "unit_price": Decimal("3600.00")}],
        )

        product_set.refresh_from_db()
        self.assertEqual(product_set.quantity, 2)
        self.assertEqual(self._pieces_loose(), loose_before,
                         "individual stock must not move when a set is sold")

    def test_cancelling_a_set_order_returns_the_sets(self):
        from warehouse.services.sales import create_sales_order, update_sales_order_status

        product_set = self._set(quantity=4)
        order = create_sales_order(
            user=self.admin, buyer_id=self.buyer.id,
            payment_mode=SalesOrder.PaymentMode.PAID,
            warehouse_id=self.warehouse.id,
            items=[{"product_set_id": product_set.id, "quantity": 3,
                    "unit_price": Decimal("3600.00")}],
        )

        update_sales_order_status(user=self.admin, id=order.id,
                                  status=SalesOrder.Status.CANCELLED)

        product_set.refresh_from_db()
        self.assertEqual(product_set.quantity, 4)

    def test_selling_more_sets_than_exist_is_refused(self):
        from warehouse.services.sales import create_sales_order

        product_set = self._set(quantity=1)

        with self.assertRaises(GraphQLError):
            create_sales_order(
                user=self.admin, buyer_id=self.buyer.id,
                payment_mode=SalesOrder.PaymentMode.PAID,
                warehouse_id=self.warehouse.id,
                items=[{"product_set_id": product_set.id, "quantity": 2,
                        "unit_price": Decimal("3600.00")}],
            )

    def test_a_line_cannot_sell_both_a_product_and_a_set(self):
        from warehouse.services.sales import create_sales_order

        product_set = self._set(quantity=1)

        with self.assertRaises(GraphQLError):
            create_sales_order(
                user=self.admin, buyer_id=self.buyer.id,
                payment_mode=SalesOrder.PaymentMode.PAID,
                warehouse_id=self.warehouse.id,
                items=[{"product_set_id": product_set.id,
                        "finished_product_id": self.products[0].id,
                        "quantity": 1, "unit_price": Decimal("100.00")}],
            )
