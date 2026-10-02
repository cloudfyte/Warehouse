"""Work sent outside is stitching, not a parallel world.

The shop runs the same step two ways. Usually cloth reaches the godown, an
employed cutting master cuts it, and the pieces go to a karigar. Sometimes the
cloth is bought and railed from the supplier straight to a unit in another city
that cuts and stitches it and sends garments back. Both are pieces out with
somebody at a rate per piece, so both are StitchingJob — these tests exist
because they used to be two models, two menus and two sets of figures.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, EmployeeProfile, FinishedProduct, ItemType,
    RawClothBatch, StitchingJob, Supplier, WarehouseLocation,
)
from warehouse.services.karigar import create_karigar, pay_karigar
from warehouse.services.production import create_finished_products, update_stitching_job
from warehouse.services.purchase_bill import create_purchase_bill


class OutsideWorkFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("outadmin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Jagtial", code="JGT")
        self.supplier = Supplier.objects.create(name="Banaras Textiles", active=True)
        self.item_type = ItemType.objects.create(name="Blazer", active=True)
        self.category = ClothCategory.objects.create(name="Silk")
        self.colour = ClothColor.objects.create(name="Maroon")
        self.unit = create_karigar(
            user=self.admin, name="Mumbai Karigars", kind="OUTSIDE",
            rate_per_piece=200, city="Mumbai")

    def _buy(self, **kw):
        line = {
            "item_kind": "RAW_CLOTH",
            "cloth_category_id": self.category.id,
            "cloth_color_id": self.colour.id,
            "total_meters": 200,
            "cost_per_meter": 100,
            "design_number": kw.pop("design_number", "BN-8891"),
            "item_type_id": self.item_type.id,
            "deliver_to_karigar_id": self.unit.id,
            "sent_lr_number": "LR-77120",
        }
        line.update(kw)
        return create_purchase_bill(
            user=self.admin, supplier_id=self.supplier.id,
            warehouse_id=self.warehouse.id, items=[line])

    def _job(self, **kw):
        bill = self._buy(**kw)
        return StitchingJob.objects.get(purchase_bill_item__bill=bill)


class TheJobStartsAtThePurchase(OutsideWorkFixture):
    """"i have purcahse from banaras textiles then with LR it went to mumbai
    karikargs the strcthing job done then it cam to our warehouse." """

    def test_cloth_sent_straight_on_never_becomes_godown_stock(self):
        self._buy()
        self.assertFalse(RawClothBatch.objects.filter(design_number="BN-8891").exists())

    def test_the_purchase_opens_a_stitching_job_not_a_world_of_its_own(self):
        job = self._job()
        self.assertTrue(job.is_outside)
        self.assertIsNone(job.cutting_assignment_id)
        self.assertEqual(job.karigar, self.unit)
        self.assertEqual(job.garment, self.item_type)
        self.assertEqual(job.cloth_design_number, "BN-8891")
        self.assertEqual(job.cloth_cost, Decimal("20000.00"))
        self.assertEqual(job.issue_lr_number, "LR-77120")
        self.assertEqual(job.rate_per_piece, Decimal("200.00"))
        self.assertEqual(job.return_warehouse, self.warehouse)

    def test_it_is_one_record_only(self):
        """Two records for one handing-out is what this replaced."""
        self._buy()
        self.assertEqual(StitchingJob.objects.count(), 1)

    def test_cloth_for_our_own_godown_still_lands_in_stock(self):
        self._buy(deliver_to_karigar_id=None, design_number="BN-8892")
        self.assertTrue(RawClothBatch.objects.filter(design_number="BN-8892").exists())
        self.assertFalse(StitchingJob.objects.exists())

    def test_the_unit_must_be_told_what_to_make(self):
        with self.assertRaises(GraphQLError):
            self._buy(item_type_id=None)

    def test_readymade_work_needs_the_customer_bill(self):
        with self.assertRaises(GraphQLError):
            self._buy(job_type="READYMADE", customer_bill_number="")


class WhatComesBackIsWhatIsPaidFor(OutsideWorkFixture):
    def test_sizes_are_counted_when_the_garments_arrive(self):
        """Nobody knows the size split on the day the cloth is bought."""
        job = self._job()
        update_stitching_job(
            id=job.id, status="READY",
            sizes=[{"size": "40", "pieces": 6, "completed": 6},
                   {"size": "42", "pieces": 4, "completed": 3}])

        job.refresh_from_db()
        self.assertEqual(job.pieces_assigned, 10)
        self.assertEqual(job.pieces_completed, 9)

    def test_the_unit_earns_on_what_it_sent_back(self):
        job = self._job()
        update_stitching_job(
            id=job.id, sizes=[{"size": "40", "pieces": 10, "completed": 7}])

        job.refresh_from_db()
        self.assertEqual(job.amount_earned, Decimal("1400.00"))  # 7 × 200, not 10

    def test_it_cannot_be_overpaid(self):
        job = self._job()
        update_stitching_job(
            id=job.id, sizes=[{"size": "40", "pieces": 10, "completed": 5}])
        with self.assertRaises(GraphQLError):
            pay_karigar(user=self.admin, stitching_job_id=job.id, amount=99999)

    def test_the_true_cost_a_piece_is_the_cloth_plus_the_making(self):
        job = self._job()
        update_stitching_job(
            id=job.id, status="READY",
            sizes=[{"size": "40", "pieces": 10, "completed": 10}])

        job.refresh_from_db()
        # 20,000 of cloth + 10 × 200 of making, over 10 pieces.
        self.assertEqual(job.cost_per_piece, Decimal("2200.00"))

    def test_garments_from_outside_reach_finished_goods_the_same_way(self):
        job = self._job()
        update_stitching_job(
            id=job.id, status="READY",
            sizes=[{"size": "40", "pieces": 10, "completed": 10}])

        create_finished_products(
            user=self.admin, stitching_job_id=job.id, warehouse_id=self.warehouse.id,
            quantity=10, cost_price=2200, sale_price=4000)

        product = FinishedProduct.objects.get(stitching_job=job)
        self.assertEqual(product.quantity, 10)
        self.assertEqual(product.item_type, self.item_type)


class OutsideWorkIsOnTheSameScreens(OutsideWorkFixture):
    def test_it_counts_in_what_a_karigar_is_holding(self):
        from warehouse.selectors import get_karigar_workload

        job = self._job()
        update_stitching_job(id=job.id, sizes=[{"size": "40", "pieces": 10}])

        row = next(r for r in get_karigar_workload(self.admin)
                   if r["karigar"].id == self.unit.id)
        self.assertEqual(row["open_pieces"], 10)

    def test_a_customer_bill_sees_it_as_stitching(self):
        from warehouse.selectors import get_customer_bills

        job = self._job(job_type="READYMADE", customer_bill_number="SW-7001")
        update_stitching_job(id=job.id, sizes=[{"size": "40", "pieces": 2}])

        row = next(r for r in get_customer_bills(self.admin)
                   if r["order"].bill_number == "SW-7001")
        self.assertEqual(row["stage"], "STITCHING")
        self.assertEqual(len(row["stitching_jobs"]), 1)


class PayingTheMakersReachesTheBooks(OutsideWorkFixture):
    """Wages that move one number on a job and nothing else are wages the
    month's figures never saw."""

    def _ready_job(self, pieces=10):
        job = self._job()
        update_stitching_job(
            id=job.id, status="READY",
            sizes=[{"size": "40", "pieces": pieces, "completed": pieces}])
        job.refresh_from_db()
        return job

    def test_paying_a_job_records_an_expense(self):
        from warehouse.models import Expense

        job = self._ready_job()
        pay_karigar(user=self.admin, stitching_job_id=job.id, amount=1200)

        expense = Expense.objects.get()
        self.assertEqual(expense.amount, Decimal("1200.00"))
        self.assertEqual(expense.category, Expense.Category.LABOR)
        self.assertEqual(expense.reference, job.job_number)
        self.assertEqual(expense.warehouse, self.warehouse)
        self.assertIn("Mumbai Karigars", expense.description)

    def test_settling_a_karigar_records_one_expense_for_the_payment(self):
        from warehouse.models import Expense
        from warehouse.services.karigar import settle_karigar

        self._ready_job()
        settle_karigar(user=self.admin, karigar_id=self.unit.id, amount=500)

        expense = Expense.objects.get()
        self.assertEqual(expense.amount, Decimal("500.00"))
        self.assertEqual(expense.category, Expense.Category.LABOR)

    def test_the_month_sees_it(self):
        from warehouse.selectors import get_dashboard_stats

        job = self._ready_job()
        pay_karigar(user=self.admin, stitching_job_id=job.id, amount=2000)

        stats = get_dashboard_stats(self.admin)
        self.assertEqual(Decimal(str(stats.expenses_this_month)), Decimal("2000.00"))
