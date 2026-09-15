"""A cutting docket is a size run, and a finished one can still be corrected.

Sealing a completed docket only moved the lie somewhere harder to fix — a
miscount is found the next morning often enough. What makes correcting it safe
is that the leftover cloth is settled as a difference against what already went
back, so the batch lands on the right number however many times the figures
change.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, EmployeeProfile, ItemType, Supplier, WarehouseLocation,
)
from warehouse.services.production import (
    create_cutting_assignment, update_cutting_assignment,
)
from warehouse.services.stock import create_raw_cloth_batch


class CuttingFixture(TestCase):
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
        self.batch = create_raw_cloth_batch(
            user=self.admin, supplier_id=supplier.id, category_id=category.id,
            color_id=color.id, warehouse_id=self.warehouse.id,
            total_meters=1000, cost_per_meter=100, design_number="4472")

    def _cut(self, meters=200, **kw):
        return create_cutting_assignment(
            user=self.admin, raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id, item_type_id=self.item_type.id,
            meters_assigned=meters, **kw)

    def _available(self):
        self.batch.refresh_from_db()
        return self.batch.available_meters


class ADocketIsASizeRun(CuttingFixture):
    def test_the_target_is_the_sum_of_the_run(self):
        cut = self._cut(sizes=[{"size": "38", "pieces": 12},
                               {"size": "40", "pieces": 20}])

        self.assertEqual(cut.target_pieces, 32)
        self.assertEqual([(s.size, s.target_pieces) for s in cut.sizes.all()],
                         [("38", 12), ("40", 20)])

    def test_a_size_with_no_count_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._cut(sizes=[{"size": "38", "pieces": 0}])

    def test_the_same_size_twice_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._cut(sizes=[{"size": "38", "pieces": 5}, {"size": "38", "pieces": 6}])

    def test_a_sizeless_docket_still_works(self):
        """Dockets were written without sizes before now, and still can be."""
        cut = self._cut(target_pieces=30)
        self.assertEqual(cut.target_pieces, 30)
        self.assertEqual(cut.sizes.count(), 0)

    def test_a_docket_needs_a_count_one_way_or_the_other(self):
        with self.assertRaises(GraphQLError):
            self._cut()


class LeftoverClothGoesBackExactlyOnce(CuttingFixture):
    def test_completing_returns_what_was_not_consumed(self):
        before = self._available()
        cut = self._cut(meters=200, target_pieces=30)
        self.assertEqual(self._available(), before - 200)

        update_cutting_assignment(id=cut.id, status="COMPLETED",
                                  pieces_completed=30, cloth_used=180, cloth_wasted=10)

        # 200 out, 190 consumed, 10 back.
        self.assertEqual(self._available(), before - 190)

    def test_correcting_a_finished_docket_moves_only_the_difference(self):
        before = self._available()
        cut = self._cut(meters=200, target_pieces=30)
        update_cutting_assignment(id=cut.id, status="COMPLETED",
                                  pieces_completed=30, cloth_used=180, cloth_wasted=10)

        # The master actually used 150, not 180.
        update_cutting_assignment(id=cut.id, cloth_used=150, cloth_wasted=10)

        # 160 consumed, so 40 is back — not 10 then another 40.
        self.assertEqual(self._available(), before - 160)

    def test_correcting_the_same_figures_twice_changes_nothing(self):
        before = self._available()
        cut = self._cut(meters=200, target_pieces=30)
        update_cutting_assignment(id=cut.id, status="COMPLETED",
                                  pieces_completed=30, cloth_used=180, cloth_wasted=10)
        after_first = self._available()

        update_cutting_assignment(id=cut.id, cloth_used=180, cloth_wasted=10)

        self.assertEqual(self._available(), after_first)
        self.assertEqual(self._available(), before - 190)

    def test_a_correction_that_would_overdraw_the_batch_is_refused(self):
        """Raising consumption pulls cloth back out. If it has since been cut
        or moved, there is nothing to pull."""
        cut = self._cut(meters=200, target_pieces=30)
        update_cutting_assignment(id=cut.id, status="COMPLETED",
                                  pieces_completed=30, cloth_used=10, cloth_wasted=0)
        # 190m went back. Send it all out again on another docket.
        self._cut(meters=self._available(), target_pieces=10)

        with self.assertRaises(GraphQLError):
            update_cutting_assignment(id=cut.id, cloth_used=200, cloth_wasted=0)


class TheStackCanBeRecounted(CuttingFixture):
    def test_the_size_run_can_be_corrected_after_completion(self):
        cut = self._cut(sizes=[{"size": "38", "pieces": 12}, {"size": "40", "pieces": 20}])
        update_cutting_assignment(id=cut.id, status="COMPLETED",
                                  pieces_completed=32, cloth_used=190, cloth_wasted=10)

        update_cutting_assignment(id=cut.id, sizes=[
            {"size": "38", "pieces": 12, "completed": 12},
            {"size": "40", "pieces": 18, "completed": 18},
        ])

        cut.refresh_from_db()
        self.assertEqual(cut.target_pieces, 30)
        self.assertEqual(cut.pieces_completed, 30)
        self.assertEqual([(s.size, s.target_pieces) for s in cut.sizes.all()],
                         [("38", 12), ("40", 18)])


class HandingOutSeveralDocketsAtOnce(CuttingFixture):
    """Three cloths to one master, or one cloth split between two. Both are a
    list of (cloth, master, metres) — only the repeating column differs."""

    def setUp(self):
        super().setUp()
        from warehouse.models import ClothCategory, ClothColor, Supplier
        from warehouse.services.stock import create_raw_cloth_batch

        self.second_master = EmployeeProfile.objects.create(
            user=User.objects.create_user("master2", password="x"),
            role=EmployeeProfile.Role.CUTTING_MASTER, active=True)
        self.other_batch = create_raw_cloth_batch(
            user=self.admin, supplier_id=Supplier.objects.first().id,
            category_id=ClothCategory.objects.first().id,
            color_id=ClothColor.objects.first().id,
            warehouse_id=self.warehouse.id, total_meters=500,
            cost_per_meter=100, design_number="4473")

    def _line(self, batch, master, meters=100, pieces=20):
        return {
            "raw_cloth_batch_id": batch.id,
            "cutting_master_id": master.id,
            "item_type_id": self.item_type.id,
            "meters_assigned": meters,
            "target_pieces": pieces,
        }

    def test_several_cloths_to_one_master(self):
        from warehouse.services.production import create_cutting_assignments

        made = create_cutting_assignments(user=self.admin, lines=[
            self._line(self.batch, self.master),
            self._line(self.other_batch, self.master),
        ])

        self.assertEqual(len(made), 2)
        self.assertEqual({a.cutting_master_id for a in made}, {self.master.id})
        self.assertEqual({a.raw_cloth_batch_id for a in made},
                         {self.batch.id, self.other_batch.id})

    def test_one_cloth_split_between_two_masters(self):
        from warehouse.services.production import create_cutting_assignments

        before = self._available()

        made = create_cutting_assignments(user=self.admin, lines=[
            self._line(self.batch, self.master, meters=120, pieces=25),
            self._line(self.batch, self.second_master, meters=80, pieces=15),
        ])

        self.assertEqual({a.cutting_master_id for a in made},
                         {self.master.id, self.second_master.id})
        # Both shares come off the same cloth.
        self.assertEqual(self._available(), before - 200)

    def test_one_bad_line_hands_out_nothing(self):
        """Half a handout leaves cloth deducted for dockets nobody agreed to."""
        from warehouse.services.production import create_cutting_assignments

        before = self._available()

        with self.assertRaises(GraphQLError):
            create_cutting_assignments(user=self.admin, lines=[
                self._line(self.batch, self.master, meters=50),
                # More metres than the batch has left.
                self._line(self.batch, self.master, meters=99999),
            ])

        self.assertEqual(self._available(), before)

    def test_the_purpose_applies_to_the_whole_handout(self):
        from warehouse.services.production import create_cutting_assignments

        made = create_cutting_assignments(
            user=self.admin,
            lines=[self._line(self.batch, self.master),
                   self._line(self.other_batch, self.second_master)],
            job_type="READYMADE", customer_bill_number="SW-9001")

        self.assertTrue(all(a.job_type == "READYMADE" for a in made))
        self.assertTrue(all(a.customer_bill_number == "SW-9001" for a in made))
