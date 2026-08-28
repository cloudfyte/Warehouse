"""Stock must be conserved across the pipeline.

Every case here is a bug that was live: quantities that were destroyed, or
minted out of nothing, because a service moved stock without checking what it
had already moved. They are written as balance assertions rather than
call-sequence assertions so they keep holding if the services are rewritten.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothCategory, ClothColor, CuttingAssignment, EmployeeProfile,
    FinishedProduct, ItemType, PurchaseOrder, PurchaseOrderItem, RawClothBatch,
    ReadymadeStock, SalesOrder, StitchingJob, Supplier, WarehouseLocation,
)
from warehouse.services.production import (
    create_cutting_assignment, create_finished_products, create_stitching_job,
    update_cutting_assignment, update_stitching_job,
)
from warehouse.services.purchase_order import receive_purchase_order
from warehouse.services.returns import create_supplier_return
from warehouse.services.sales import create_sales_order, update_sales_order_status


class StockFixture(TestCase):
    """The smallest world in which cloth can move: one of everything."""

    def setUp(self):
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)

        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        self.supplier = Supplier.objects.create(name="Mill", active=True)
        self.category = ClothCategory.objects.create(name="Silk", active=True)
        self.color = ClothColor.objects.create(name="Pista Green", active=True)
        self.item_type = ItemType.objects.create(name="Indowestern", active=True)

        self.master = self._employee("master", EmployeeProfile.Role.CUTTING_MASTER)
        self.tailor = self._employee("tailor", EmployeeProfile.Role.TAILOR)

        self.batch = RawClothBatch.objects.create(
            supplier=self.supplier,
            cloth_category=self.category,
            cloth_color=self.color,
            warehouse=self.warehouse,
            total_meters=Decimal("100.00"),
            available_meters=Decimal("100.00"),
            cost_per_meter=Decimal("50.00"),
        )

    def _employee(self, username, role):
        user = User.objects.create_user(username, password="x")
        profile = EmployeeProfile.objects.create(user=user, role=role, active=True)
        profile.locations.add(self.warehouse)
        return profile


class CuttingReturnsLeftoverCloth(StockFixture):
    def test_unconsumed_meters_go_back_to_the_batch(self):
        assignment = create_cutting_assignment(
            user=self.admin,
            raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id,
            item_type_id=self.item_type.id,
            meters_assigned=Decimal("40.00"),
            target_pieces=20,
        )
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("60.00"))

        # Used 30m, wasted 2m in offcuts — 8m of good cloth is left over.
        update_cutting_assignment(
            id=assignment.id,
            status=CuttingAssignment.Status.COMPLETED,
            pieces_completed=18,
            cloth_used=Decimal("30.00"),
            cloth_wasted=Decimal("2.00"),
        )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("68.00"))

    def test_completed_assignment_cannot_be_completed_twice(self):
        assignment = create_cutting_assignment(
            user=self.admin,
            raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id,
            item_type_id=self.item_type.id,
            meters_assigned=Decimal("40.00"),
            target_pieces=20,
        )
        update_cutting_assignment(
            id=assignment.id, status=CuttingAssignment.Status.COMPLETED,
            pieces_completed=18, cloth_used=Decimal("30.00"),
        )
        self.batch.refresh_from_db()
        after_first = self.batch.available_meters

        with self.assertRaises(GraphQLError):
            update_cutting_assignment(
                id=assignment.id, status=CuttingAssignment.Status.COMPLETED,
                pieces_completed=18, cloth_used=Decimal("30.00"),
            )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, after_first)

    def test_used_plus_wasted_cannot_exceed_assigned(self):
        assignment = create_cutting_assignment(
            user=self.admin,
            raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id,
            item_type_id=self.item_type.id,
            meters_assigned=Decimal("40.00"),
            target_pieces=20,
        )
        with self.assertRaises(GraphQLError):
            update_cutting_assignment(
                id=assignment.id, status=CuttingAssignment.Status.COMPLETED,
                pieces_completed=18,
                cloth_used=Decimal("39.00"), cloth_wasted=Decimal("5.00"),
            )


class FinishedGoodsCannotBeMinted(StockFixture):
    def _ready_job(self, pieces=10):
        assignment = create_cutting_assignment(
            user=self.admin,
            raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id,
            item_type_id=self.item_type.id,
            meters_assigned=Decimal("40.00"),
            target_pieces=pieces,
        )
        update_cutting_assignment(
            id=assignment.id, status=CuttingAssignment.Status.COMPLETED,
            pieces_completed=pieces, cloth_used=Decimal("38.00"),
        )
        job = create_stitching_job(
            user=self.admin,
            cutting_assignment_id=assignment.id,
            tailor_id=self.tailor.id,
            pieces_assigned=pieces,
        )
        update_stitching_job(
            id=job.id, status=StitchingJob.Status.READY,
            pieces_completed=pieces, pieces_rejected=0,
        )
        return job

    def _move(self, job, quantity):
        return create_finished_products(
            user=self.admin,
            stitching_job_id=job.id,
            quantity=quantity,
            warehouse_id=self.warehouse.id,
            cost_price=Decimal("500.00"),
            sale_price=Decimal("999.00"),
        )

    def test_cannot_move_more_pieces_than_were_stitched(self):
        job = self._ready_job(pieces=10)
        with self.assertRaises(GraphQLError):
            self._move(job, 11)
        self.assertEqual(FinishedProduct.objects.count(), 0)

    def test_moving_the_same_job_twice_cannot_exceed_the_total(self):
        job = self._ready_job(pieces=10)
        self._move(job, 6)
        with self.assertRaises(GraphQLError):
            self._move(job, 6)

        moved = sum(fp.quantity for fp in FinishedProduct.objects.all())
        self.assertEqual(moved, 6)

    def test_a_job_can_be_moved_in_instalments_up_to_its_total(self):
        job = self._ready_job(pieces=10)
        self._move(job, 6)
        self._move(job, 4)

        moved = sum(fp.quantity for fp in FinishedProduct.objects.all())
        self.assertEqual(moved, 10)
        job.refresh_from_db()
        self.assertEqual(job.status, StitchingJob.Status.MOVED)


class SalesOrderCancellation(StockFixture):
    def setUp(self):
        super().setUp()
        from warehouse.models import Buyer
        self.buyer = Buyer.objects.create(name="Shop", active=True)
        self.product = FinishedProduct.objects.create(
            item_type=self.item_type,
            cloth_category=self.category,
            cloth_color=self.color,
            size="40",
            source=FinishedProduct.Source.IN_HOUSE,
            quantity=50,
            warehouse=self.warehouse,
            cost_price=Decimal("500.00"),
            sale_price=Decimal("999.00"),
        )

    def _order(self, quantity=5):
        return create_sales_order(
            user=self.admin,
            buyer_id=self.buyer.id,
            payment_mode=SalesOrder.PaymentMode.PAID,
            warehouse_id=self.warehouse.id,
            items=[{
                "finished_product_id": self.product.id,
                "quantity": quantity,
                "unit_price": Decimal("999.00"),
            }],
        )

    def test_cancelling_returns_the_pieces_to_stock(self):
        order = self._order(quantity=5)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 45)

        update_sales_order_status(id=order.id, status=SalesOrder.Status.CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 50)

    def test_a_cancelled_order_cannot_be_reopened(self):
        order = self._order(quantity=5)
        update_sales_order_status(id=order.id, status=SalesOrder.Status.CANCELLED)

        with self.assertRaises(GraphQLError):
            update_sales_order_status(id=order.id, status=SalesOrder.Status.REQUESTED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 50)

    def test_cancelling_twice_does_not_credit_stock_twice(self):
        order = self._order(quantity=5)
        update_sales_order_status(id=order.id, status=SalesOrder.Status.CANCELLED)
        # Same status again is a no-op, not a second refund.
        update_sales_order_status(id=order.id, status=SalesOrder.Status.CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 50)


class PurchaseOrderReceipt(StockFixture):
    def _placed_po(self, meters=Decimal("75.00")):
        po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            order_type=PurchaseOrder.OrderType.RAW_CLOTH,
            warehouse=self.warehouse,
            status=PurchaseOrder.Status.PLACED,
            created_by=self.admin,
        )
        item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            item_kind=PurchaseOrderItem.ItemKind.RAW_CLOTH,
            cloth_category=self.category,
            cloth_color=self.color,
            ordered_meters=meters,
            unit_price=Decimal("50.00"),
            total_price=Decimal("50.00") * meters,
        )
        return po, item

    def test_receiving_twice_does_not_create_stock_twice(self):
        po, item = self._placed_po()
        receipt = [{"po_item_id": item.id, "received_meters": Decimal("75.00")}]

        receive_purchase_order(po_id=po.id, user=self.admin, receipt_items=receipt)
        with self.assertRaises(GraphQLError):
            receive_purchase_order(po_id=po.id, user=self.admin, receipt_items=receipt)

        batches = RawClothBatch.objects.filter(po_item=item)
        self.assertEqual(batches.count(), 1)
        self.assertEqual(batches.first().available_meters, Decimal("75.00"))

    def test_a_received_order_cannot_be_reopened_to_be_received_again(self):
        from warehouse.services.purchase_order import update_purchase_order_status

        po, item = self._placed_po()
        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id, "received_meters": Decimal("75.00")}],
        )

        with self.assertRaises(GraphQLError):
            update_purchase_order_status(id=po.id, status=PurchaseOrder.Status.PLACED)

        self.assertEqual(RawClothBatch.objects.filter(po_item=item).count(), 1)


class SupplierReturnsLeaveStock(StockFixture):
    def test_returning_cloth_removes_it_from_the_batch(self):
        create_supplier_return(
            user=self.admin,
            supplier_id=self.supplier.id,
            return_kind="RAW_CLOTH",
            reason="Wrong shade",
            warehouse_id=self.warehouse.id,
            raw_cloth_batch_id=self.batch.id,
            meters_returned=Decimal("30.00"),
        )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("70.00"))

    def test_cannot_return_more_cloth_than_is_in_stock(self):
        with self.assertRaises(GraphQLError):
            create_supplier_return(
                user=self.admin,
                supplier_id=self.supplier.id,
                return_kind="RAW_CLOTH",
                reason="Wrong shade",
                warehouse_id=self.warehouse.id,
                raw_cloth_batch_id=self.batch.id,
                meters_returned=Decimal("140.00"),
            )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("100.00"))

    def test_returning_readymade_units_removes_them_from_stock(self):
        stock = ReadymadeStock.objects.create(
            supplier=self.supplier,
            item_type=self.item_type,
            cloth_color=self.color,
            size="40",
            warehouse=self.warehouse,
            quantity_received=20,
            quantity_available=20,
            cost_price=Decimal("400.00"),
        )

        create_supplier_return(
            user=self.admin,
            supplier_id=self.supplier.id,
            return_kind="READYMADE",
            reason="Damaged",
            warehouse_id=self.warehouse.id,
            readymade_stock_id=stock.id,
            quantity_returned=8,
        )

        stock.refresh_from_db()
        self.assertEqual(stock.quantity_available, 12)


class ScalarsReachTheClientAsRealTypes(TestCase):
    """JSONField and DecimalField used to serialise as JSON *strings*.

    A `"[]"` is truthy and has length 2, so guards passed and `for...of` walked
    the characters — that is what printed blank product tags and showed custom
    roles an empty tab list. The converters in warehouse/schema/converters.py
    fix it schema-wide; this pins the schema so a future type cannot regress.
    """

    def test_no_output_field_is_a_json_or_decimal_string(self):
        from config.schema import schema

        offenders = [
            line.strip() for line in str(schema).splitlines()
            if ("JSONString" in line or ": Decimal" in line)
            and "(" not in line and "scalar" not in line
        ]
        self.assertEqual(offenders, [], f"string-typed output fields: {offenders}")

    def test_json_field_round_trips_as_an_object(self):
        from warehouse.models import CustomRole
        from config.schema import schema

        CustomRole.objects.create(
            name="cutting_only",
            display_name="Cutting Only",
            backend_level="STORE_KEEPER",
            tab_permissions={"cutting": True, "sales": False},
        )
        user = User.objects.create_superuser("root", password="x")

        class Ctx:
            pass
        ctx = Ctx()
        ctx.user = user

        result = schema.execute("{ customRoles { tabPermissions } }", context=ctx)
        self.assertIsNone(result.errors)
        perms = result.data["customRoles"][0]["tabPermissions"]
        self.assertIsInstance(perms, dict)
        self.assertTrue(perms["cutting"])
