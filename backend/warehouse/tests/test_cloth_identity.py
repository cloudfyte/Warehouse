"""A lot of cloth is known by its design number, not its batch number.

"The 4472" is what the floor calls it, and it is what a cutting docket gets
written against — so the number has to be captured where it is known (buying
the cloth) and carried onto the batch, rather than asked for again afterwards.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, EmployeeProfile, RawClothBatch, Supplier,
    WarehouseLocation,
)
from warehouse.services.purchase_bill import create_purchase_bill
from warehouse.services.stock import create_raw_cloth_batch, update_raw_cloth_batch


class ClothFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        self.supplier = Supplier.objects.create(name="Surat Mills", active=True)
        self.category = ClothCategory.objects.create(name="Silk", active=True)
        self.color = ClothColor.objects.create(name="Pista Green", active=True)


class TheDesignNumberTravelsWithTheCloth(ClothFixture):
    def test_a_bill_carries_its_design_number_onto_the_batch(self):
        create_purchase_bill(
            user=self.admin,
            supplier_id=self.supplier.id,
            warehouse_id=self.warehouse.id,
            items=[{
                "item_kind": "RAW_CLOTH",
                "cloth_category_id": self.category.id,
                "cloth_color_id": self.color.id,
                "total_meters": 100,
                "cost_per_meter": 120,
                "unit_price": 120,
                "design_number": "4472",
                "cloth_code": "K7200",
            }],
        )

        batch = RawClothBatch.objects.get()
        self.assertEqual(batch.design_number, "4472")
        self.assertEqual(batch.cloth_code, "K7200")

    def test_a_bill_without_one_simply_has_none(self):
        create_purchase_bill(
            user=self.admin,
            supplier_id=self.supplier.id,
            warehouse_id=self.warehouse.id,
            items=[{
                "item_kind": "RAW_CLOTH",
                "cloth_category_id": self.category.id,
                "cloth_color_id": self.color.id,
                "total_meters": 50, "cost_per_meter": 90, "unit_price": 90,
            }],
        )

        batch = RawClothBatch.objects.get()
        self.assertEqual(batch.design_number, "")
        # Nothing is invented from the price. A made-up code is a code nobody
        # else can look up.
        self.assertEqual(batch.cloth_code, "")


class ABatchsPaperworkCanBeCorrected(ClothFixture):
    def _batch(self):
        return create_raw_cloth_batch(
            user=self.admin, supplier_id=self.supplier.id,
            category_id=self.category.id, color_id=self.color.id,
            warehouse_id=self.warehouse.id, total_meters=80, cost_per_meter=100,
        )

    def test_the_design_number_can_be_added_after_the_cloth_arrives(self):
        batch = self._batch()
        self.assertEqual(batch.design_number, "")

        update_raw_cloth_batch(
            user=self.admin, id=batch.id, design_number="4472",
            cloth_code="K7200", bin_location="A-3")

        batch.refresh_from_db()
        self.assertEqual(batch.design_number, "4472")
        self.assertEqual(batch.cloth_code, "K7200")
        self.assertEqual(batch.bin_location, "A-3")

    def test_correcting_paperwork_never_touches_the_meters(self):
        """Meters are stock. A wrong quantity is a stock adjustment, which
        leaves a trail this deliberately does not."""
        batch = self._batch()

        update_raw_cloth_batch(user=self.admin, id=batch.id, design_number="4472")

        batch.refresh_from_db()
        self.assertEqual(batch.total_meters, Decimal("80.00"))
        self.assertEqual(batch.available_meters, Decimal("80.00"))

    def test_a_tailor_cannot_rewrite_a_batch(self):
        batch = self._batch()
        tailor = User.objects.create_user("tailor", password="x")
        EmployeeProfile.objects.create(
            user=tailor, role=EmployeeProfile.Role.TAILOR, active=True)

        with self.assertRaises(GraphQLError):
            update_raw_cloth_batch(user=tailor, id=batch.id, design_number="9999")


class ReadymadeWorkNamesItsCustomer(ClothFixture):
    """Wholesale stitching goes to stock. Readymade is stitched for one
    customer, so it has to name the bill it belongs to — otherwise a finished
    garment cannot be matched back to whoever is waiting for it."""

    def setUp(self):
        super().setUp()
        from warehouse.models import ItemType, StitchingJob
        from warehouse.services.production import (
            create_cutting_assignment, update_cutting_assignment,
        )

        self.item_type = ItemType.objects.create(name="Sherwani", active=True)
        self.batch = create_raw_cloth_batch(
            user=self.admin, supplier_id=self.supplier.id,
            category_id=self.category.id, color_id=self.color.id,
            warehouse_id=self.warehouse.id, total_meters=200, cost_per_meter=100)
        self.master = EmployeeProfile.objects.create(
            user=User.objects.create_user("master", password="x"),
            role=EmployeeProfile.Role.CUTTING_MASTER, active=True)
        self.tailor = EmployeeProfile.objects.create(
            user=User.objects.create_user("tailor", password="x"),
            role=EmployeeProfile.Role.TAILOR, active=True)

        self.cut = create_cutting_assignment(
            user=self.admin, raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id, item_type_id=self.item_type.id,
            meters_assigned=100, target_pieces=20)
        update_cutting_assignment(
            id=self.cut.id, status="COMPLETED", pieces_completed=20,
            cloth_used=90, cloth_wasted=10)
        self.StitchingJob = StitchingJob

    def _job(self, **kw):
        from warehouse.services.production import create_stitching_job
        return create_stitching_job(
            user=self.admin, cutting_assignment_id=self.cut.id,
            tailor_id=self.tailor.id, pieces_assigned=5, **kw)

    def test_work_is_wholesale_unless_said_otherwise(self):
        job = self._job()
        self.assertEqual(job.job_type, self.StitchingJob.JobType.WHOLESALE)
        self.assertEqual(job.customer_bill_number, "")

    def test_readymade_without_a_bill_number_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._job(job_type="READYMADE")

    def test_readymade_keeps_the_customers_bill_number(self):
        job = self._job(job_type="READYMADE", customer_bill_number="SW-1042")
        self.assertEqual(job.customer_bill_number, "SW-1042")

    def test_a_bill_number_on_wholesale_work_is_dropped(self):
        """Wholesale work belongs to stock, not to a customer. Keeping a bill
        number on it would suggest somebody is waiting for it."""
        job = self._job(job_type="WHOLESALE", customer_bill_number="SW-1042")
        self.assertEqual(job.customer_bill_number, "")
