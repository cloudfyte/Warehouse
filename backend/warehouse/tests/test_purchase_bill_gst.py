"""GST on purchase bills must survive being entered late.

Every case here is a bill that printed with no tax on it. The setting defaults
to off, so bills entered before anyone turned it on stored zero tax — and until
now nothing in the app could restate them.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, ItemType, PurchaseBill, PurchaseBillItem,
    Supplier, SystemSettings, WarehouseLocation,
)
from warehouse.services.purchase_bill import create_purchase_bill, update_purchase_bill_gst


class GstFixture(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)

        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        # Same state as the company default, so a supply from here is intra-state.
        self.local_supplier = Supplier.objects.create(
            name="Chennai Mills", state="Tamil Nadu", active=True)
        self.outside_supplier = Supplier.objects.create(
            name="Surat Mills", state="Gujarat", active=True)
        self.item_type = ItemType.objects.create(
            name="Sherwani", gst_rate=Decimal("12.00"), active=True)

        self.settings = SystemSettings.load()
        self.settings.company_state = "Tamil Nadu"
        self.settings.gst_on_purchases = True
        self.settings.save()

    def _bill(self, supplier=None, gst_rate=None):
        return create_purchase_bill(
            user=self.admin,
            supplier_id=(supplier or self.local_supplier).id,
            warehouse_id=self.warehouse.id,
            items=[{
                "item_kind": "READYMADE",
                "item_type_id": self.item_type.id,
                "quantity": 10,
                "unit_price": 100,
                **({"gst_rate": gst_rate} if gst_rate is not None else {}),
            }],
        )


class GstIsAppliedOnCreation(GstFixture):
    def test_a_blank_rate_falls_back_to_the_item_types_configured_rate(self):
        """Leaving GST blank used to mean zero, so the bill printed with no tax."""
        bill = self._bill()

        self.assertEqual(bill.taxable_amount, Decimal("1000.00"))
        self.assertEqual(bill.tax_amount, Decimal("120.00"))   # 12% of 1000
        self.assertEqual(bill.total_amount, Decimal("1120.00"))

    def test_an_explicit_zero_still_means_zero(self):
        bill = self._bill(gst_rate=0)

        self.assertEqual(bill.tax_amount, Decimal("0.00"))
        self.assertEqual(bill.total_amount, Decimal("1000.00"))

    def test_a_supplier_in_our_own_state_is_split_into_cgst_and_sgst(self):
        bill = self._bill(supplier=self.local_supplier)

        self.assertEqual(bill.cgst_amount + bill.sgst_amount, bill.tax_amount)
        self.assertEqual(bill.igst_amount, Decimal("0.00"))

    def test_a_supplier_in_another_state_is_charged_igst(self):
        bill = self._bill(supplier=self.outside_supplier)

        self.assertEqual(bill.igst_amount, bill.tax_amount)
        self.assertEqual(bill.cgst_amount, Decimal("0.00"))
        self.assertEqual(bill.sgst_amount, Decimal("0.00"))


class GstCanBeRestatedLater(GstFixture):
    def _bill_saved_without_gst(self):
        """The situation that started this: the setting was off when it was entered."""
        self.settings.gst_on_purchases = False
        self.settings.save()
        bill = self._bill()
        self.assertEqual(bill.tax_amount, Decimal("0.00"))
        self.settings.gst_on_purchases = True
        self.settings.save()
        return bill

    def test_a_bill_entered_before_gst_was_switched_on_can_be_restated(self):
        bill = self._bill_saved_without_gst()

        update_purchase_bill_gst(user=self.admin, bill_id=bill.id, gst_rate=12)

        bill.refresh_from_db()
        self.assertEqual(bill.taxable_amount, Decimal("1000.00"))
        self.assertEqual(bill.tax_amount, Decimal("120.00"))
        self.assertEqual(bill.total_amount, Decimal("1120.00"))
        self.assertEqual(bill.cgst_amount + bill.sgst_amount, Decimal("120.00"))

    def test_restating_does_not_change_what_was_bought(self):
        bill = self._bill_saved_without_gst()
        before = list(PurchaseBillItem.objects.filter(bill=bill)
                      .values_list("quantity", "unit_price", "total_price"))

        update_purchase_bill_gst(user=self.admin, bill_id=bill.id, gst_rate=18)

        after = list(PurchaseBillItem.objects.filter(bill=bill)
                     .values_list("quantity", "unit_price", "total_price"))
        self.assertEqual(before, after)

    def test_a_per_line_rate_beats_the_blanket_rate(self):
        bill = self._bill_saved_without_gst()
        line = bill.items.first()

        update_purchase_bill_gst(
            user=self.admin, bill_id=bill.id, gst_rate=18,
            items=[{"id": line.id, "gst_rate": 5}],
        )

        bill.refresh_from_db()
        self.assertEqual(bill.tax_amount, Decimal("50.00"))  # 5% of 1000, not 18%

    def test_payment_status_follows_the_restated_total(self):
        bill = self._bill_saved_without_gst()
        bill.amount_paid = Decimal("1000.00")
        bill.payment_status = PurchaseBill.PaymentStatus.PAID
        bill.save(update_fields=["amount_paid", "payment_status"])

        update_purchase_bill_gst(user=self.admin, bill_id=bill.id, gst_rate=12)

        bill.refresh_from_db()
        # 1000 paid against a restated 1120 is no longer settled.
        self.assertEqual(bill.payment_status, PurchaseBill.PaymentStatus.PARTIAL)

    def test_it_refuses_to_leave_a_bill_overpaid(self):
        bill = self._bill()
        bill.amount_paid = bill.total_amount
        bill.save(update_fields=["amount_paid"])

        with self.assertRaises(GraphQLError):
            update_purchase_bill_gst(user=self.admin, bill_id=bill.id, gst_rate=0)

    def test_it_refuses_while_gst_on_purchases_is_switched_off(self):
        bill = self._bill()
        self.settings.gst_on_purchases = False
        self.settings.save()

        with self.assertRaises(GraphQLError):
            update_purchase_bill_gst(user=self.admin, bill_id=bill.id, gst_rate=12)

    def test_a_nonsense_rate_is_refused(self):
        bill = self._bill()

        with self.assertRaises(GraphQLError):
            update_purchase_bill_gst(user=self.admin, bill_id=bill.id, gst_rate=150)
