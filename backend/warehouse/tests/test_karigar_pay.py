"""Stitchers are paid by the piece, and are not necessarily staff.

An outside unit in another city charges per garment, has no login here, and
settles against what it actually finished — not against what it was handed.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, EmployeeProfile, ItemType, Karigar, Supplier,
    WarehouseLocation,
)
from warehouse.services.karigar import create_karigar, pay_karigar, update_karigar
from warehouse.services.production import (
    create_cutting_assignment, create_stitching_job, update_cutting_assignment,
    update_stitching_job,
)
from warehouse.services.stock import create_raw_cloth_batch


class KarigarFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Jagtial", code="JGT")
        supplier = Supplier.objects.create(name="Surat Mills", active=True)
        category = ClothCategory.objects.create(name="Silk", active=True)
        color = ClothColor.objects.create(name="Red", active=True)
        self.item_type = ItemType.objects.create(name="Kurta", active=True)
        self.master = EmployeeProfile.objects.create(
            user=User.objects.create_user("master", password="x"),
            role=EmployeeProfile.Role.CUTTING_MASTER, active=True)

        batch = create_raw_cloth_batch(
            user=self.admin, supplier_id=supplier.id, category_id=category.id,
            color_id=color.id, warehouse_id=self.warehouse.id,
            total_meters=500, cost_per_meter=100, design_number="4472")
        self.cut = create_cutting_assignment(
            user=self.admin, raw_cloth_batch_id=batch.id,
            cutting_master_id=self.master.id, item_type_id=self.item_type.id,
            meters_assigned=200, target_pieces=100)
        update_cutting_assignment(
            id=self.cut.id, status="COMPLETED", pieces_completed=100,
            cloth_used=190, cloth_wasted=10)

        self.mumbai = create_karigar(
            user=self.admin, name="Mumbai Unit A", kind="OUTSIDE",
            rate_per_piece=45, city="Mumbai")

    def _job(self, pieces=20, **kw):
        return create_stitching_job(
            user=self.admin, cutting_assignment_id=self.cut.id,
            pieces_assigned=pieces, karigar_id=self.mumbai.id, **kw)


class AnOutsideUnitIsNotStaff(KarigarFixture):
    def test_a_job_can_be_given_to_a_karigar_with_no_login(self):
        job = self._job()

        self.assertEqual(job.karigar_id, self.mumbai.id)
        # Nobody to notify, and nothing should have blown up trying.
        self.assertIsNone(job.tailor)

    def test_somebody_has_to_be_doing_the_work(self):
        with self.assertRaises(GraphQLError):
            create_stitching_job(
                user=self.admin, cutting_assignment_id=self.cut.id, pieces_assigned=5)


class PayFollowsFinishedWork(KarigarFixture):
    def test_a_job_earns_nothing_until_pieces_are_finished(self):
        job = self._job(pieces=20)

        self.assertEqual(job.rate_per_piece, Decimal("45.00"))
        self.assertEqual(job.amount_earned, Decimal("0.00"))

    def test_earnings_count_finished_pieces_not_assigned_ones(self):
        job = self._job(pieces=20)
        update_stitching_job(id=job.id, pieces_completed=18, pieces_rejected=2)

        job.refresh_from_db()
        # 18 stitched at 45, not 20. A rejected piece was not made to standard.
        self.assertEqual(job.amount_earned, Decimal("810.00"))
        self.assertEqual(job.amount_due, Decimal("810.00"))

    def test_paying_reduces_what_is_due(self):
        job = self._job(pieces=20)
        update_stitching_job(id=job.id, pieces_completed=10)

        pay_karigar(user=self.admin, stitching_job_id=job.id, amount=200)

        job.refresh_from_db()
        self.assertEqual(job.amount_paid, Decimal("200.00"))
        self.assertEqual(job.amount_due, Decimal("250.00"))

    def test_a_job_cannot_be_overpaid(self):
        job = self._job(pieces=20)
        update_stitching_job(id=job.id, pieces_completed=10)

        with self.assertRaises(GraphQLError):
            pay_karigar(user=self.admin, stitching_job_id=job.id, amount=999)


class TheAgreedRateSurvivesARateChange(KarigarFixture):
    def test_changing_a_karigars_rate_does_not_rewrite_old_jobs(self):
        """Editing a rate sets what the next job costs, never what an old one
        settles for. Otherwise a rate change silently rewrites history."""
        job = self._job(pieces=10)
        update_stitching_job(id=job.id, pieces_completed=10)

        update_karigar(user=self.admin, id=self.mumbai.id, rate_per_piece=80)

        job.refresh_from_db()
        self.assertEqual(job.rate_per_piece, Decimal("45.00"))
        self.assertEqual(job.amount_earned, Decimal("450.00"))

    def test_a_job_may_agree_its_own_rate(self):
        """A heavier garment is worth more than a plain one."""
        job = self._job(pieces=10, rate_per_piece=120)
        update_stitching_job(id=job.id, pieces_completed=10)

        job.refresh_from_db()
        self.assertEqual(job.amount_earned, Decimal("1200.00"))


class TheKarigarRegister(KarigarFixture):
    def test_two_active_karigars_cannot_share_a_name(self):
        with self.assertRaises(GraphQLError):
            create_karigar(user=self.admin, name="mumbai unit a", rate_per_piece=50)

    def test_a_rate_cannot_be_negative(self):
        with self.assertRaises(GraphQLError):
            create_karigar(user=self.admin, name="Bad Unit", rate_per_piece=-5)


class WhatEachKarigarIsHolding(KarigarFixture):
    """The stitching screen is organised by job. A karigar at the counter wants
    the other axis: everything of theirs, and what is owed on it."""

    def test_the_workload_totals_open_and_finished_work(self):
        from warehouse.selectors import get_karigar_workload

        open_job = self._job(pieces=20)
        done_job = self._job(pieces=10)
        update_stitching_job(id=done_job.id, pieces_completed=10, status="READY")

        rows = get_karigar_workload(self.admin)
        mine = next(r for r in rows if r["karigar"].id == self.mumbai.id)

        self.assertEqual(mine["open_pieces"], 20)
        self.assertEqual(mine["finished_pieces"], 10)
        self.assertEqual(mine["amount_due"], Decimal("450.00"))
        self.assertEqual([j.id for j in mine["jobs"]], [open_job.id])

    def test_a_job_carries_its_size_run(self):
        from warehouse.models import StitchingSize

        job = create_stitching_job(
            user=self.admin, cutting_assignment_id=self.cut.id,
            karigar_id=self.mumbai.id,
            sizes=[{"size": "38", "pieces": 8}, {"size": "40", "pieces": 12}])

        self.assertEqual(job.pieces_assigned, 20)
        self.assertEqual(
            [(z.size, z.pieces_assigned) for z in StitchingSize.objects.filter(job=job)],
            [("38", 8), ("40", 12)])
