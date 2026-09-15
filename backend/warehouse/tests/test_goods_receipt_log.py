"""Who took the goods in, and when.

A supplier delivers over two or three trips. Each arrival used to overwrite the
last on the order, so an order taken in by one storekeeper on Monday and
another on Thursday remembered only Thursday — and only the date, never the
time somebody actually stood at the bay.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, EmployeeProfile, GoodsReceipt, PurchaseOrder,
    Supplier, WarehouseLocation,
)
from warehouse.services.purchase_order import (
    create_purchase_order, receive_purchase_order, update_purchase_order_status,
)


class ReceiptFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.other = User.objects.create_user("storekeeper", password="x")
        self.other_profile = EmployeeProfile.objects.create(
            user=self.other, role=EmployeeProfile.Role.STORE_KEEPER, active=True)

        self.warehouse = WarehouseLocation.objects.create(name="Jagtial", code="JGT")
        # A store keeper only sees the godowns they are posted to.
        self.other_profile.locations.add(self.warehouse)
        self.supplier = Supplier.objects.create(name="Surat Mills", active=True)
        self.category = ClothCategory.objects.create(name="Silk", active=True)
        self.color = ClothColor.objects.create(name="Red", active=True)

        self.po = create_purchase_order(
            user=self.admin, supplier_id=self.supplier.id,
            warehouse_id=self.warehouse.id, order_type="RAW_CLOTH",
            items=[{
                "item_kind": "RAW_CLOTH",
                "cloth_category_id": self.category.id,
                "cloth_color_id": self.color.id,
                "ordered_meters": 500, "unit_price": 100,
            }],
        )
        self.item = self.po.items.first()
        # An order is placed, then the goods turn up.
        update_purchase_order_status(user=self.admin, id=self.po.id, status='PLACED')
        self.po.refresh_from_db()

    def _receive(self, user, meters, design_number):
        return receive_purchase_order(
            po_id=self.po.id, user=user,
            receipt_items=[{"po_item_id": self.item.id,
                            "received_meters": Decimal(str(meters)),
                            "design_number": design_number}])


class EveryArrivalIsItsOwnRecord(ReceiptFixture):
    def test_one_delivery_records_who_and_when(self):
        self._receive(self.admin, 200, "4472")

        receipt = GoodsReceipt.objects.get()
        self.assertEqual(receipt.received_by_id, self.admin.id)
        self.assertIsNotNone(receipt.received_at)
        # To the minute, not just the day.
        self.assertTrue(hasattr(receipt.received_at, "hour"))

    def test_two_deliveries_by_two_people_keep_both_names(self):
        """The whole point: Monday's storekeeper is not erased by Thursday's."""
        self._receive(self.admin, 200, "4472")
        self._receive(self.other, 300, "4472")

        receipts = list(GoodsReceipt.objects.order_by("received_at"))
        self.assertEqual([r.received_by_id for r in receipts],
                         [self.admin.id, self.other.id])

    def test_each_record_says_what_that_delivery_contained(self):
        self._receive(self.admin, 200, "4472")
        self._receive(self.other, 300, "4472")

        first, second = GoodsReceipt.objects.order_by("received_at")
        self.assertEqual(first.lines.get().meters_received, Decimal("200.00"))
        self.assertEqual(second.lines.get().meters_received, Decimal("300.00"))

    def test_the_order_still_shows_the_latest_receiver(self):
        self._receive(self.admin, 200, "4472")
        self._receive(self.other, 300, "4472")

        self.po.refresh_from_db()
        self.assertEqual(self.po.received_by_id, self.other.id)
        self.assertEqual(self.po.status, PurchaseOrder.Status.RECEIVED)

    def test_a_delivery_that_books_nothing_leaves_no_record(self):
        """An empty record would be a delivery that never took place."""
        self._receive(self.admin, 500, "4472")

        with self.assertRaises(GraphQLError):
            self._receive(self.other, 100, "4472")

        self.assertEqual(GoodsReceipt.objects.count(), 1)

    def test_the_design_number_read_at_the_bay_is_kept_on_the_line(self):
        self._receive(self.admin, 200, "4472")

        self.assertEqual(GoodsReceipt.objects.get().lines.get().design_number, "4472")
