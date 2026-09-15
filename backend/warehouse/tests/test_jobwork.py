"""Whole jobs given to an outside handler.

The in-house path is cloth into the godown, an employed cutting master, then a
karigar. This is the other one the shop actually runs: the supplier ships cloth
straight to a unit in another city that cuts and stitches it and sends garments
back. The cloth never touches a godown.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, FinishedProduct, ItemType, JobworkOrder, RawClothBatch,
    Supplier, WarehouseLocation,
)
from warehouse.services.jobwork import create_jobwork_order, pay_jobwork, receive_jobwork
from warehouse.services.karigar import create_karigar


class JobworkFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Jagtial", code="JGT")
        self.supplier = Supplier.objects.create(name="Surat Mills", active=True)
        self.item_type = ItemType.objects.create(name="Blazer", active=True)
        self.unit = create_karigar(
            user=self.admin, name="Mumbai Handler", kind="OUTSIDE",
            rate_per_piece=200, city="Mumbai")

    def _order(self, **kw):
        kw.setdefault("sizes", [{"size": "40", "pieces": 10}, {"size": "42", "pieces": 10}])
        return create_jobwork_order(
            user=self.admin, karigar_id=self.unit.id, item_type_id=self.item_type.id,
            receive_warehouse_id=self.warehouse.id, supplier_id=self.supplier.id,
            design_number="4472", cloth_meters=200, cloth_cost=20000, **kw)


class ClothThatNeverReachesTheGodown(JobworkFixture):
    def test_an_outside_job_creates_no_cloth_batch(self):
        """The cloth went from Surat to Mumbai. Booking it into a godown it
        never reached would invent stock that is not on any shelf."""
        self._order()

        self.assertEqual(RawClothBatch.objects.count(), 0)

    def test_the_order_remembers_where_the_cloth_came_from(self):
        order = self._order()

        self.assertEqual(order.supplier_id, self.supplier.id)
        self.assertEqual(order.design_number, "4472")
        self.assertEqual(order.cloth_cost, Decimal("20000.00"))

    def test_an_order_needs_to_say_what_it_expects_back(self):
        with self.assertRaises(GraphQLError):
            self._order(sizes=[])

    def test_the_rate_is_frozen_when_the_job_is_placed(self):
        order = self._order()
        self.assertEqual(order.rate_per_piece, Decimal("200.00"))


class WhatComesBackIsWhatIsPaidFor(JobworkFixture):
    def test_receiving_counts_by_size(self):
        order = self._order()

        receive_jobwork(user=self.admin, id=order.id,
                        sizes=[{"size": "40", "received": 10},
                               {"size": "42", "received": 8}])

        order.refresh_from_db()
        self.assertEqual(order.pieces_received, 18)
        self.assertEqual(order.status, JobworkOrder.Status.PARTIAL)

    def test_a_full_delivery_closes_the_order(self):
        order = self._order()

        receive_jobwork(user=self.admin, id=order.id,
                        sizes=[{"size": "40", "received": 10},
                               {"size": "42", "received": 10}])

        order.refresh_from_db()
        self.assertEqual(order.status, JobworkOrder.Status.RECEIVED)

    def test_more_cannot_come_back_than_went_out(self):
        order = self._order()

        with self.assertRaises(GraphQLError):
            receive_jobwork(user=self.admin, id=order.id,
                            sizes=[{"size": "40", "received": 99}])

    def test_a_size_that_was_never_ordered_is_refused(self):
        order = self._order()

        with self.assertRaises(GraphQLError):
            receive_jobwork(user=self.admin, id=order.id,
                            sizes=[{"size": "46", "received": 2}])

    def test_the_unit_earns_on_pieces_received_not_pieces_ordered(self):
        order = self._order()
        receive_jobwork(user=self.admin, id=order.id,
                        sizes=[{"size": "40", "received": 10},
                               {"size": "42", "received": 5}])

        order.refresh_from_db()
        # 15 back at 200, not 20 ordered at 200.
        self.assertEqual(order.amount_earned, Decimal("3000.00"))

    def test_it_cannot_be_overpaid(self):
        order = self._order()
        receive_jobwork(user=self.admin, id=order.id,
                        sizes=[{"size": "40", "received": 10}])

        with self.assertRaises(GraphQLError):
            pay_jobwork(user=self.admin, id=order.id, amount=99999)


class GarmentsLandAtTheirRealCost(JobworkFixture):
    def test_receiving_with_a_price_puts_them_into_stock(self):
        order = self._order()

        receive_jobwork(user=self.admin, id=order.id, sale_price=3500,
                        sizes=[{"size": "40", "received": 10},
                               {"size": "42", "received": 10}])

        made = FinishedProduct.objects.filter(item_type=self.item_type)
        self.assertEqual(sorted(p.size for p in made), ["40", "42"])
        self.assertEqual(sum(p.quantity for p in made), 20)

    def test_cost_is_the_cloth_plus_the_making(self):
        """20,000 of cloth and 20 pieces at 200 making is 24,000 over 20 —
        1,200 each. Known exactly here and nowhere else."""
        order = self._order()

        receive_jobwork(user=self.admin, id=order.id, sale_price=3500,
                        sizes=[{"size": "40", "received": 10},
                               {"size": "42", "received": 10}])

        for product in FinishedProduct.objects.all():
            self.assertEqual(product.cost_price, Decimal("1200.00"))

    def test_receiving_without_a_price_books_nothing_into_stock(self):
        order = self._order()

        receive_jobwork(user=self.admin, id=order.id,
                        sizes=[{"size": "40", "received": 10}])

        self.assertEqual(FinishedProduct.objects.count(), 0)

    def test_a_readymade_job_carries_its_bill_onto_the_garments(self):
        order = self._order(job_type="READYMADE", customer_bill_number="SW-3001")

        receive_jobwork(user=self.admin, id=order.id, sale_price=4000,
                        sizes=[{"size": "40", "received": 10}])

        product = FinishedProduct.objects.get()
        self.assertEqual(product.customer_bill_number, "SW-3001")

    def test_readymade_needs_a_bill_number(self):
        with self.assertRaises(GraphQLError):
            self._order(job_type="READYMADE")


class NothingIsFinishedUntilTheCustomerHasIt(JobworkFixture):
    """A readymade garment is not finished when it is tagged. It is finished
    when the person who asked for it is holding it."""

    def _made(self, pieces=3, bill="SW-3001"):
        order = self._order(job_type="READYMADE", customer_bill_number=bill,
                            sizes=[{"size": "40", "pieces": pieces}])
        receive_jobwork(user=self.admin, id=order.id, sale_price=4000,
                        sizes=[{"size": "40", "received": pieces}])
        return FinishedProduct.objects.get(customer_bill_number=bill, quantity__gt=0)

    def test_it_waits_until_collected(self):
        from warehouse.selectors import get_awaiting_collection

        product = self._made()

        waiting = list(get_awaiting_collection(self.admin))
        self.assertEqual([p.id for p in waiting], [product.id])

    def test_collecting_takes_it_out_of_stock(self):
        from warehouse.services.production import hand_over_readymade

        product = self._made()

        hand_over_readymade(user=self.admin, id=product.id, handed_over_to="Ravi")

        product.refresh_from_db()
        self.assertEqual(product.quantity, 0)
        self.assertIsNotNone(product.handed_over_at)
        self.assertEqual(product.handed_over_to, "Ravi")

    def test_a_part_collection_leaves_the_rest_waiting(self):
        """Two of three collected leaves one under the same bill, rather than
        closing the whole line."""
        from warehouse.selectors import get_awaiting_collection
        from warehouse.services.production import hand_over_readymade

        product = self._made(pieces=3)

        hand_over_readymade(user=self.admin, id=product.id, quantity=2, handed_over_to="Ravi")

        product.refresh_from_db()
        self.assertEqual(product.quantity, 1)
        still = list(get_awaiting_collection(self.admin))
        self.assertEqual([p.id for p in still], [product.id])

    def test_wholesale_stock_cannot_be_handed_over(self):
        from warehouse.services.production import hand_over_readymade

        order = self._order(sizes=[{"size": "40", "pieces": 2}])
        receive_jobwork(user=self.admin, id=order.id, sale_price=3000,
                        sizes=[{"size": "40", "received": 2}])
        product = FinishedProduct.objects.get()

        with self.assertRaises(GraphQLError):
            hand_over_readymade(user=self.admin, id=product.id)

    def test_it_cannot_be_collected_twice(self):
        from warehouse.services.production import hand_over_readymade

        product = self._made()
        hand_over_readymade(user=self.admin, id=product.id)

        with self.assertRaises(GraphQLError):
            hand_over_readymade(user=self.admin, id=product.id)


class TheWrittenBillTravelsWithTheWork(JobworkFixture):
    """Somebody is measured in the shop and leaves with a handwritten bill. The
    garment is made here, and every step has to say whose it is — including the
    photograph of the paper, which is where the measurements actually live."""

    def test_the_bill_becomes_a_record_with_the_customer_on_it(self):
        from warehouse.models import CustomerOrder

        order = self._order(job_type="READYMADE", customer_bill_number="SW-4001",
                            customer_name="Ravi Kumar", customer_phone="9876543210",
                            sizes=[{"size": "40", "pieces": 2}])

        bill = CustomerOrder.objects.get(bill_number="SW-4001")
        self.assertEqual(bill.customer_name, "Ravi Kumar")
        self.assertEqual(bill.customer_phone, "9876543210")
        self.assertEqual(order.customer_order_id, bill.id)

    def test_naming_the_same_bill_twice_does_not_make_two_of_it(self):
        from warehouse.models import CustomerOrder

        self._order(job_type="READYMADE", customer_bill_number="SW-4002",
                    customer_name="Ravi", sizes=[{"size": "40", "pieces": 1}])
        self._order(job_type="READYMADE", customer_bill_number="SW-4002",
                    sizes=[{"size": "42", "pieces": 1}])

        self.assertEqual(CustomerOrder.objects.filter(bill_number="SW-4002").count(), 1)

    def test_details_given_later_fill_blanks_rather_than_wipe_them(self):
        """The photograph of the paper usually turns up after somebody has
        already typed the number."""
        from warehouse.models import CustomerOrder

        self._order(job_type="READYMADE", customer_bill_number="SW-4003",
                    customer_name="Ravi", sizes=[{"size": "40", "pieces": 1}])
        self._order(job_type="READYMADE", customer_bill_number="SW-4003",
                    customer_name="Somebody Else", customer_phone="99999",
                    sizes=[{"size": "42", "pieces": 1}])

        bill = CustomerOrder.objects.get(bill_number="SW-4003")
        self.assertEqual(bill.customer_name, "Ravi")
        self.assertEqual(bill.customer_phone, "99999")

    def test_the_garment_points_at_the_same_bill(self):
        from warehouse.models import CustomerOrder

        order = self._order(job_type="READYMADE", customer_bill_number="SW-4004",
                            customer_name="Ravi", sizes=[{"size": "40", "pieces": 2}])
        receive_jobwork(user=self.admin, id=order.id, sale_price=4000,
                        sizes=[{"size": "40", "received": 2}])

        bill = CustomerOrder.objects.get(bill_number="SW-4004")
        product = FinishedProduct.objects.get()
        self.assertEqual(product.customer_order_id, bill.id)
        self.assertEqual(product.customer_bill_number, "SW-4004")

    def test_wholesale_work_makes_no_bill_record(self):
        from warehouse.models import CustomerOrder

        self._order(sizes=[{"size": "40", "pieces": 2}])

        self.assertEqual(CustomerOrder.objects.count(), 0)
