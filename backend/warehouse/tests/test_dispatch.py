"""Goods must not leave the building untraceable.

An order that has been dispatched with no lorry receipt is the case this
covers: when the parcel does not arrive, the LR number is the only thing that
finds it.
"""
import base64
import os
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    Buyer, ClothCategory, ClothColor, EmployeeProfile, FinishedProduct,
    ItemType, SalesOrder, WarehouseLocation,
)
from warehouse.services.sales import create_sales_order, dispatch_sales_order


def _photo():
    return "data:image/png;base64," + base64.b64encode(os.urandom(400)).decode()


class DispatchFixture(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)

        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        self.buyer = Buyer.objects.create(name="Shop", active=True)
        self.item_type = ItemType.objects.create(name="Sherwani", active=True)
        self.product = FinishedProduct.objects.create(
            item_type=self.item_type,
            cloth_category=ClothCategory.objects.create(name="Silk", active=True),
            cloth_color=ClothColor.objects.create(name="Pista Green", active=True),
            size="40",
            source=FinishedProduct.Source.IMPORTED,
            quantity=50,
            warehouse=self.warehouse,
            cost_price=Decimal("500.00"),
            sale_price=Decimal("999.00"),
        )

    def _order(self):
        return create_sales_order(
            user=self.admin,
            buyer_id=self.buyer.id,
            payment_mode=SalesOrder.PaymentMode.PAID,
            warehouse_id=self.warehouse.id,
            items=[{"finished_product_id": self.product.id,
                    "quantity": 5, "unit_price": Decimal("999.00")}],
        )


class RecordingAShipment(DispatchFixture):
    def test_dispatching_stores_the_lorry_receipt_and_moves_the_status(self):
        order = self._order()

        dispatch_sales_order(
            user=self.admin, id=order.id,
            transporter_name="VRL Logistics",
            lr_number="VRL-99812",
            vehicle_number="ts07 ab 1234",
            driver_phone="9876543210",
            freight_charges=850,
        )

        order.refresh_from_db()
        self.assertEqual(order.status, SalesOrder.Status.DISPATCHED)
        self.assertEqual(order.lr_number, "VRL-99812")
        self.assertEqual(order.transporter_name, "VRL Logistics")
        self.assertEqual(order.vehicle_number, "TS07 AB 1234")  # normalised
        self.assertEqual(order.freight_charges, Decimal("850.00"))
        self.assertIsNotNone(order.dispatch_date)

    def test_photos_of_the_parcel_are_stored_as_paths(self):
        order = self._order()

        dispatch_sales_order(
            user=self.admin, id=order.id, lr_number="VRL-1",
            dispatch_photos=",".join([_photo(), _photo()]),
        )

        order.refresh_from_db()
        paths = order.dispatch_photos.split(",")
        self.assertEqual(len(paths), 2)
        self.assertTrue(all(p.startswith("dispatch/") for p in paths))

    def test_a_shipment_with_nothing_to_trace_it_by_is_refused(self):
        order = self._order()

        with self.assertRaises(GraphQLError):
            dispatch_sales_order(user=self.admin, id=order.id)

        order.refresh_from_db()
        self.assertNotEqual(order.status, SalesOrder.Status.DISPATCHED)

    def test_the_transporter_alone_is_enough(self):
        order = self._order()

        dispatch_sales_order(user=self.admin, id=order.id, transporter_name="Local tempo")

        order.refresh_from_db()
        self.assertEqual(order.status, SalesOrder.Status.DISPATCHED)

    def test_an_order_cannot_be_dispatched_twice(self):
        order = self._order()
        dispatch_sales_order(user=self.admin, id=order.id, lr_number="VRL-1")

        with self.assertRaises(GraphQLError):
            dispatch_sales_order(user=self.admin, id=order.id, lr_number="VRL-2")

        order.refresh_from_db()
        self.assertEqual(order.lr_number, "VRL-1")

    def test_a_cancelled_order_cannot_be_dispatched(self):
        from warehouse.services.sales import update_sales_order_status

        order = self._order()
        update_sales_order_status(user=self.admin, id=order.id,
                                  status=SalesOrder.Status.CANCELLED)

        with self.assertRaises(GraphQLError):
            dispatch_sales_order(user=self.admin, id=order.id, lr_number="VRL-1")

    def test_negative_freight_is_refused(self):
        order = self._order()

        with self.assertRaises(GraphQLError):
            dispatch_sales_order(user=self.admin, id=order.id,
                                 lr_number="VRL-1", freight_charges=-10)
