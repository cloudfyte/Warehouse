"""Stock must be conserved across the pipeline.

Every case here is a bug that was live: quantities that were destroyed, or
minted out of nothing, because a service moved stock without checking what it
had already moved. They are written as balance assertions rather than
call-sequence assertions so they keep holding if the services are rewritten.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
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

        update_sales_order_status(user=self.admin, id=order.id, status=SalesOrder.Status.CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 50)

    def test_a_cancelled_order_cannot_be_reopened(self):
        order = self._order(quantity=5)
        update_sales_order_status(user=self.admin, id=order.id, status=SalesOrder.Status.CANCELLED)

        with self.assertRaises(GraphQLError):
            update_sales_order_status(user=self.admin, id=order.id, status=SalesOrder.Status.REQUESTED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 50)

    def test_cancelling_twice_does_not_credit_stock_twice(self):
        order = self._order(quantity=5)
        update_sales_order_status(user=self.admin, id=order.id, status=SalesOrder.Status.CANCELLED)
        # Same status again is a no-op, not a second refund.
        update_sales_order_status(user=self.admin, id=order.id, status=SalesOrder.Status.CANCELLED)

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
            update_purchase_order_status(user=self.admin, id=po.id, status=PurchaseOrder.Status.PLACED)

        self.assertEqual(RawClothBatch.objects.filter(po_item=item).count(), 1)


    def _placed_readymade_po(self, pieces=100):
        po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            order_type=PurchaseOrder.OrderType.READYMADE,
            warehouse=self.warehouse,
            status=PurchaseOrder.Status.PLACED,
            created_by=self.admin,
        )
        item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            item_kind=PurchaseOrderItem.ItemKind.READYMADE,
            item_type=self.item_type,
            ordered_quantity=pieces,
            unit_price=Decimal("200.00"),
            total_price=Decimal("200.00") * pieces,
        )
        return po, item

    def test_a_hundred_pieces_can_arrive_in_three_lorries(self):
        """The order stays open until the last piece lands, and nothing is lost on the way."""
        po, item = self._placed_readymade_po(pieces=100)

        for sent in (30, 30, 40):
            receive_purchase_order(
                po_id=po.id, user=self.admin,
                receipt_items=[{"po_item_id": item.id, "received_quantity": sent}],
            )
            po.refresh_from_db()
            item.refresh_from_db()

        self.assertEqual(item.received_quantity, 100)
        self.assertEqual(po.status, PurchaseOrder.Status.RECEIVED)

        # One stock row per delivery, and together they account for every piece.
        rows = ReadymadeStock.objects.filter(po_item=item)
        self.assertEqual(rows.count(), 3)
        self.assertEqual(sum(r.quantity_received for r in rows), 100)

    def test_an_order_is_part_received_until_the_balance_arrives(self):
        po, item = self._placed_readymade_po(pieces=100)

        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id, "received_quantity": 30}],
        )
        po.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.PARTIALLY_RECEIVED)
        self.assertEqual(item.received_quantity, 30)

    def test_the_supplier_cannot_deliver_more_than_was_ordered(self):
        po, item = self._placed_readymade_po(pieces=100)
        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id, "received_quantity": 80}],
        )

        with self.assertRaises(GraphQLError):
            receive_purchase_order(
                po_id=po.id, user=self.admin,
                receipt_items=[{"po_item_id": item.id, "received_quantity": 30}],
            )

        item.refresh_from_db()
        self.assertEqual(item.received_quantity, 80)
        self.assertEqual(ReadymadeStock.objects.filter(po_item=item).count(), 1)

    def test_omitting_the_quantity_receives_only_what_is_still_outstanding(self):
        """The UI can send every line each time; complete lines are skipped, not doubled."""
        po, item = self._placed_readymade_po(pieces=100)
        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id, "received_quantity": 30}],
        )

        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id}],
        )

        item.refresh_from_db()
        po.refresh_from_db()
        self.assertEqual(item.received_quantity, 100)
        self.assertEqual(po.status, PurchaseOrder.Status.RECEIVED)

    def test_a_part_received_order_cannot_be_closed_by_hand(self):
        from warehouse.services.purchase_order import update_purchase_order_status

        po, item = self._placed_readymade_po(pieces=100)
        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id, "received_quantity": 30}],
        )

        with self.assertRaises(GraphQLError):
            update_purchase_order_status(
                user=self.admin, id=po.id, status=PurchaseOrder.Status.RECEIVED)

        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.PARTIALLY_RECEIVED)

    def test_a_short_delivery_can_be_closed_by_verifying_it(self):
        from warehouse.services.purchase_order import update_purchase_order_status

        po, item = self._placed_readymade_po(pieces=100)
        receive_purchase_order(
            po_id=po.id, user=self.admin,
            receipt_items=[{"po_item_id": item.id, "received_quantity": 30}],
        )

        update_purchase_order_status(
            user=self.admin, id=po.id, status=PurchaseOrder.Status.VERIFIED)

        po.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.VERIFIED)
        self.assertEqual(item.received_quantity, 30)


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


class WarehouseScopingBlocksOtherBranches(StockFixture):
    """A role check proves the caller is a manager somewhere, not everywhere.

    Before permissions.scoped(), every mutation that took an object id fetched
    it with a bare pk lookup, so a store keeper at one branch could move,
    adjust, or sell another branch's stock just by sending its id.
    """

    def setUp(self):
        super().setUp()
        # A second branch, and a keeper who is assigned only to it.
        self.other_branch = WarehouseLocation.objects.create(name="Branch", code="BR")
        outsider = User.objects.create_user("outsider", password="x")
        self.outsider = EmployeeProfile.objects.create(
            user=outsider, role=EmployeeProfile.Role.STORE_KEEPER, active=True)
        self.outsider.locations.add(self.other_branch)
        self.outsider_user = outsider

    def test_cannot_cut_cloth_belonging_to_another_branch(self):
        with self.assertRaisesRegex(GraphQLError, "not found in your warehouses"):
            create_cutting_assignment(
                user=self.outsider_user,
                raw_cloth_batch_id=self.batch.id,
                cutting_master_id=self.master.id,
                item_type_id=self.item_type.id,
                meters_assigned=Decimal("10.00"),
                target_pieces=5,
            )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("100.00"))

    def test_cannot_return_another_branch_cloth_to_a_supplier(self):
        with self.assertRaisesRegex(GraphQLError, "not found in your warehouses"):
            create_supplier_return(
                user=self.outsider_user,
                supplier_id=self.supplier.id,
                return_kind="RAW_CLOTH",
                reason="not mine",
                warehouse_id=self.other_branch.id,
                raw_cloth_batch_id=self.batch.id,
                meters_returned=Decimal("10.00"),
            )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("100.00"))

    def test_cannot_adjust_another_branch_stock(self):
        from warehouse.models import StockAdjustment
        from warehouse.services.stock_adjustment import create_stock_adjustment

        with self.assertRaisesRegex(GraphQLError, "not found in your warehouses"):
            create_stock_adjustment(
                user=self.outsider_user,
                item_kind=StockAdjustment.ItemKind.RAW_CLOTH,
                quantity_change=Decimal("-50.00"),
                adjustment_type="LOSS",
                reason="not mine",
                warehouse_id=self.other_branch.id,
                raw_cloth_batch_id=self.batch.id,
            )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("100.00"))

    def test_the_owning_branch_is_still_allowed(self):
        # The scoping must not lock out the people it is meant to serve.
        self.outsider.locations.add(self.warehouse)

        create_cutting_assignment(
            user=self.outsider_user,
            raw_cloth_batch_id=self.batch.id,
            cutting_master_id=self.master.id,
            item_type_id=self.item_type.id,
            meters_assigned=Decimal("10.00"),
            target_pieces=5,
        )

        self.batch.refresh_from_db()
        self.assertEqual(self.batch.available_meters, Decimal("90.00"))


class ReadsAreScopedToo(StockFixture):
    """Scoping the mutations is only half of it.

    get_buyer_returns and get_supplier_returns both accepted a `user` and then
    ignored it, so a store keeper at one branch could read every branch's
    returns through the returns tab.
    """

    def setUp(self):
        super().setUp()
        from warehouse.models import Buyer, BuyerReturn, SupplierReturn

        self.other_branch = WarehouseLocation.objects.create(name="Branch", code="BR")
        outsider = User.objects.create_user("outsider2", password="x")
        profile = EmployeeProfile.objects.create(
            user=outsider, role=EmployeeProfile.Role.STORE_KEEPER, active=True)
        profile.locations.add(self.other_branch)
        self.outsider_user = outsider

        buyer = Buyer.objects.create(name="Shop", active=True)
        product = FinishedProduct.objects.create(
            item_type=self.item_type, cloth_category=self.category,
            cloth_color=self.color, size="40",
            source=FinishedProduct.Source.IN_HOUSE, quantity=5,
            warehouse=self.warehouse,
            cost_price=Decimal("500.00"), sale_price=Decimal("999.00"),
        )
        # A return belonging to the main warehouse, which the outsider is not on.
        BuyerReturn.objects.create(
            buyer=buyer, finished_product=product, quantity=1,
            condition="GOOD", reason="too small", warehouse=self.warehouse,
        )
        SupplierReturn.objects.create(
            supplier=self.supplier, return_kind="RAW_CLOTH",
            raw_cloth_batch=self.batch, meters_returned=Decimal("5.00"),
            reason="shade", warehouse=self.warehouse,
        )

    def test_another_branch_returns_are_not_listed(self):
        from warehouse.selectors import get_buyer_returns, get_supplier_returns

        self.assertEqual(get_buyer_returns(self.outsider_user).count(), 0)
        self.assertEqual(get_supplier_returns(self.outsider_user).count(), 0)

    def test_the_owning_branch_still_sees_its_own(self):
        from warehouse.selectors import get_buyer_returns, get_supplier_returns

        self.assertEqual(get_buyer_returns(self.admin).count(), 1)
        self.assertEqual(get_supplier_returns(self.admin).count(), 1)


class SettingsExposure(TestCase):
    """Who can read the integration config, and what the login screen can see."""

    def setUp(self):
        from warehouse.models import SystemSettings

        cfg = SystemSettings.load()
        cfg.app_name = "Sri WareHouse"
        cfg.company_name = "Sri Weddings"
        cfg.smtp_host = "smtp.example.com"
        cfg.smtp_user = "mailer@example.com"
        cfg.twilio_account_sid = "AC0123456789"
        cfg.save()

        from django.core.cache import cache
        cache.delete("system_settings")

        self.admin = User.objects.create_user("cfgadmin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.tailor = User.objects.create_user("cfgtailor", password="x")
        EmployeeProfile.objects.create(
            user=self.tailor, role=EmployeeProfile.Role.TAILOR, active=True)

    def _run(self, query, user):
        from config.schema import schema

        class Ctx:
            pass
        ctx = Ctx()
        ctx.user = user
        return schema.execute(query, context=ctx)

    QUERY = "{ systemSettings { smtpHost smtpUser twilioAccountSid appName } }"

    def test_a_tailor_cannot_read_the_mail_or_sms_config(self):
        result = self._run(self.QUERY, self.tailor)
        self.assertIsNone(result.errors)
        s = result.data["systemSettings"]
        self.assertIsNone(s["smtpHost"])
        self.assertIsNone(s["smtpUser"])
        self.assertIsNone(s["twilioAccountSid"])
        # Branding is not secret — the app still has to render.
        self.assertEqual(s["appName"], "Sri WareHouse")

    def test_an_admin_can_still_read_it_back(self):
        result = self._run(self.QUERY, self.admin)
        self.assertIsNone(result.errors)
        s = result.data["systemSettings"]
        self.assertEqual(s["smtpHost"], "smtp.example.com")
        self.assertEqual(s["twilioAccountSid"], "AC0123456789")

    def test_the_login_screen_can_read_branding_without_a_token(self):
        from django.contrib.auth.models import AnonymousUser

        result = self._run(
            "{ publicSettings { appName companyName primaryColor } }", AnonymousUser())
        self.assertIsNone(result.errors)
        self.assertEqual(result.data["publicSettings"]["appName"], "Sri WareHouse")
        self.assertEqual(result.data["publicSettings"]["companyName"], "Sri Weddings")

    def test_the_public_query_exposes_nothing_but_branding(self):
        from config.schema import schema

        fields = {f.lower() for f in schema.graphql_schema
                  .get_type("PublicSettingsType").fields}
        for leak in ("smtphost", "smtpuser", "twilioaccountsid", "gstin", "watoken"):
            self.assertNotIn(leak, fields)


class QueryCountsDoNotGrowWithRows(StockFixture):
    """N+1 guard.

    The dashboard pulls most entities at once, so a per-row lookup anywhere is
    multiplied by the whole table. These assert the query count for a page of
    records is a small constant — if someone drops a select_related, the number
    climbs with the row count and the test fails with the new figure.
    """

    def setUp(self):
        super().setUp()
        self._seed(10)

    def _seed(self, count):
        from warehouse.models import PurchaseOrder, PurchaseOrderItem

        for _ in range(count):
            po = PurchaseOrder.objects.create(
                supplier=self.supplier,
                order_type=PurchaseOrder.OrderType.RAW_CLOTH,
                warehouse=self.warehouse,
                status=PurchaseOrder.Status.PLACED,
                created_by=self.admin,
            )
            for _ in range(3):
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    item_kind=PurchaseOrderItem.ItemKind.RAW_CLOTH,
                    cloth_category=self.category,
                    cloth_color=self.color,
                    ordered_meters=Decimal("10.00"),
                    unit_price=Decimal("50.00"),
                    total_price=Decimal("500.00"),
                )

    def _ctx(self):
        class Ctx:
            pass
        c = Ctx()
        c.user = self.admin
        return c

    def test_purchase_orders_with_items_and_people_is_a_constant(self):
        from config.schema import schema

        query = """{ purchaseOrders {
            poNumber
            createdBy { username }
            receivedBy { username }
            items { itemKind clothCategory { name } clothColor { name } itemType { name } }
        } }"""

        result = schema.execute(query, context=self._ctx())
        self.assertIsNone(result.errors)
        self.assertEqual(len(result.data["purchaseOrders"]), 10)

        with CaptureQueriesContext(connection) as first:
            schema.execute(query, context=self._ctx())

        # Triple the data. A query count that is genuinely constant will not
        # move; a per-row lookup anywhere will roughly triple with it. Asserting
        # the shape rather than a magic number keeps this from breaking every
        # time a legitimate field is added.
        self._seed(20)
        result = schema.execute(query, context=self._ctx())
        self.assertEqual(len(result.data["purchaseOrders"]), 30)

        with CaptureQueriesContext(connection) as second:
            schema.execute(query, context=self._ctx())

        self.assertEqual(
            len(second.captured_queries), len(first.captured_queries),
            f"query count grew with the row count: {len(first.captured_queries)} "
            f"for 10 orders, {len(second.captured_queries)} for 30 — "
            f"something is querying per row.",
        )

    def test_get_profile_is_read_once_per_request_not_per_selector(self):
        from config.schema import schema

        # Four selectors in one query, each of which calls get_profile (some
        # twice, via accessible_warehouses). Without the per-request memo this
        # re-read the same EmployeeProfile row for every one of them.
        query = """{
            purchaseOrders { poNumber }
            rawClothBatches { batchNumber }
            finishedProducts { sku }
            employees { id }
        }"""
        result = schema.execute(query, context=self._ctx())
        self.assertIsNone(result.errors)

        with CaptureQueriesContext(connection) as ctx:
            schema.execute(query, context=self._ctx())
        profile_reads = [
            q for q in ctx.captured_queries
            if "employeeprofile" in q["sql"].lower() and " where " in q["sql"].lower()
            and "user_id" in q["sql"].lower()
        ]
        self.assertLessEqual(
            len(profile_reads), 1,
            f"profile re-read {len(profile_reads)} times:\n" +
            "\n".join(q["sql"][:120] for q in profile_reads),
        )


class FinishedProductEditing(StockFixture):
    """Correcting goods already in stock must not become a way to invent stock."""

    def setUp(self):
        super().setUp()
        self.product = FinishedProduct.objects.create(
            item_type=self.item_type,
            cloth_category=self.category,
            cloth_color=self.color,
            size="40",
            source=FinishedProduct.Source.IMPORTED,
            quantity=12,
            warehouse=self.warehouse,
            cost_price=Decimal("500.00"),
            sale_price=Decimal("900.00"),
        )

    def test_sale_price_is_stored_per_piece_not_as_a_batch_total(self):
        """A 12-piece batch priced at 900 means 900 a piece — the tag prints this number."""
        from warehouse.services.production import update_finished_product

        update_finished_product(user=self.admin, id=self.product.id, sale_price=1200)

        self.product.refresh_from_db()
        self.assertEqual(self.product.sale_price, Decimal("1200.00"))
        self.assertEqual(self.product.quantity, 12)

    def test_details_can_be_corrected_without_touching_quantity(self):
        from warehouse.services.production import update_finished_product

        update_finished_product(user=self.admin, id=self.product.id, size="42", age_group="ADULT")

        self.product.refresh_from_db()
        self.assertEqual(self.product.size, "42")
        self.assertEqual(self.product.age_group, "ADULT")
        self.assertEqual(self.product.quantity, 12)

    def test_a_store_keeper_cannot_reprice_stock(self):
        from warehouse.services.production import update_finished_product

        keeper = self._employee("keeper", EmployeeProfile.Role.STORE_KEEPER)

        with self.assertRaises(GraphQLError):
            update_finished_product(user=keeper.user, id=self.product.id, sale_price=1)

        self.product.refresh_from_db()
        self.assertEqual(self.product.sale_price, Decimal("900.00"))

    def test_a_negative_price_is_refused(self):
        from warehouse.services.production import update_finished_product

        with self.assertRaises(GraphQLError):
            update_finished_product(user=self.admin, id=self.product.id, sale_price=-5)

        self.product.refresh_from_db()
        self.assertEqual(self.product.sale_price, Decimal("900.00"))


class BarcodesCarryThePrice(StockFixture):
    """The price lives inside the code, so repricing must not orphan printed tags."""

    def _product(self, sale_price=Decimal("1299.00")):
        return FinishedProduct.objects.create(
            item_type=self.item_type,
            cloth_color=self.color,
            size="40",
            source=FinishedProduct.Source.IMPORTED,
            quantity=5,
            warehouse=self.warehouse,
            cost_price=Decimal("500.00"),
            sale_price=sale_price,
        )

    def test_the_code_contains_the_price_between_two_random_pairs(self):
        product = self._product(Decimal("1299.00"))

        self.assertEqual(len(product.barcode), 8)          # 2 + 4 + 2
        self.assertEqual(product.barcode[2:-2], "1299")
        self.assertTrue(product.barcode[:2].isalnum())
        self.assertTrue(product.barcode[-2:].isalnum())

    def test_two_products_at_the_same_price_get_different_codes(self):
        first = self._product(Decimal("1299.00"))
        second = self._product(Decimal("1299.00"))

        self.assertNotEqual(first.barcode, second.barcode)

    def test_repricing_mints_a_new_code_and_keeps_the_old_one_scannable(self):
        from warehouse.services.production import update_finished_product

        product = self._product(Decimal("1299.00"))
        printed_on_the_rack = product.barcode

        update_finished_product(user=self.admin, id=product.id, sale_price=1499)

        product.refresh_from_db()
        self.assertEqual(product.barcode[2:-2], "1499")
        self.assertNotEqual(product.barcode, printed_on_the_rack)
        self.assertIn(printed_on_the_rack, product.past_codes())
        # The rack is now wrong, so the tag has to be printed again.
        self.assertFalse(product.tags_printed)

    def test_repricing_twice_keeps_every_old_code(self):
        from warehouse.services.production import update_finished_product

        product = self._product(Decimal("1000.00"))
        first = product.barcode
        update_finished_product(user=self.admin, id=product.id, sale_price=1100)
        product.refresh_from_db()
        second = product.barcode
        update_finished_product(user=self.admin, id=product.id, sale_price=1200)
        product.refresh_from_db()

        self.assertIn(first, product.past_codes())
        self.assertIn(second, product.past_codes())

    def test_changing_something_other_than_price_leaves_the_code_alone(self):
        from warehouse.services.production import update_finished_product

        product = self._product()
        original = product.barcode

        update_finished_product(user=self.admin, id=product.id, size="42")

        product.refresh_from_db()
        self.assertEqual(product.barcode, original)
        self.assertEqual(product.past_codes(), [])
