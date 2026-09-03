"""A product can be called something other than its item type.

"Kurtha" is the classification — every kurtha in the warehouse is one. This
particular product is "Pintex Kurtha Daman". Renaming the item type to say so
would rename every kurtha ever bought, which is why the name lives on the
product.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import EmployeeProfile, FinishedProduct, ItemType, WarehouseLocation
from warehouse.services.production import create_finished_products, update_finished_product


class ProductNameOverridesItemType(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        self.item_type = ItemType.objects.create(name="Pintex Kurtha", active=True)
        self.product = create_finished_products(
            user=self.admin, item_type_id=self.item_type.id,
            warehouse_id=self.warehouse.id, quantity=5,
            cost_price=500, sale_price=1200,
        )

    def test_a_new_product_has_no_name_of_its_own(self):
        self.assertEqual(self.product.name, "")

    def test_renaming_one_product_leaves_the_item_type_and_its_siblings_alone(self):
        sibling = create_finished_products(
            user=self.admin, item_type_id=self.item_type.id,
            warehouse_id=self.warehouse.id, quantity=2,
            cost_price=500, sale_price=1200, size="40",
        )

        update_finished_product(
            user=self.admin, id=self.product.id, name="Pintex Kurtha Daman")

        self.product.refresh_from_db()
        self.item_type.refresh_from_db()
        sibling.refresh_from_db()
        self.assertEqual(self.product.name, "Pintex Kurtha Daman")
        self.assertEqual(self.item_type.name, "Pintex Kurtha")
        self.assertEqual(sibling.name, "")

    def test_an_empty_name_puts_the_product_back_under_its_item_type(self):
        update_finished_product(
            user=self.admin, id=self.product.id, name="Pintex Kurtha Daman")
        update_finished_product(user=self.admin, id=self.product.id, name="")

        self.product.refresh_from_db()
        self.assertEqual(self.product.name, "")

    def test_renaming_does_not_touch_the_barcode(self):
        """The barcode buries the cost price. A name has nothing to do with it,
        so a rename must not invalidate tags already hanging on the rack."""
        before = self.product.barcode

        update_finished_product(
            user=self.admin, id=self.product.id, name="Pintex Kurtha Daman")

        self.product.refresh_from_db()
        self.assertEqual(self.product.barcode, before)
        self.assertNotIn(self.product.barcode, FinishedProduct.objects.get(
            pk=self.product.pk).past_codes())


class ColourEditsDoNotDisturbTheBarcode(TestCase):
    """The barcode buries the cost price and nothing else.

    So a colour or a size correction leaves it alone — the code still points at
    this product row, and a scan reads back whatever the row says now. Tags
    already sewn onto garments keep working; only the words printed on an old
    tag are out of date, which is what reprinting is for.
    """
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin2", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        self.item_type = ItemType.objects.create(name="Kurtha", active=True)
        self.product = create_finished_products(
            user=self.admin, item_type_id=self.item_type.id,
            warehouse_id=self.warehouse.id, quantity=3,
            cost_price=500, sale_price=1200, size="40",
        )

    def test_changing_colour_and_size_keeps_the_same_barcode(self):
        from warehouse.models import ClothColor

        colour = ClothColor.objects.create(name="Off White")
        before = self.product.barcode

        update_finished_product(
            user=self.admin, id=self.product.id,
            cloth_color_id=colour.id, size="42")

        self.product.refresh_from_db()
        self.assertEqual(self.product.barcode, before)
        self.assertEqual(self.product.past_codes(), [])
        self.assertEqual(self.product.size, "42")
        self.assertEqual(self.product.cloth_color_id, colour.id)

    def test_changing_the_cost_does_mint_a_new_code_and_keeps_the_old_scannable(self):
        before = self.product.barcode

        update_finished_product(user=self.admin, id=self.product.id, cost_price=650)

        self.product.refresh_from_db()
        self.assertNotEqual(self.product.barcode, before)
        self.assertIn(before, self.product.past_codes())


class AnyShadeCanBeNamed(TestCase):
    """Garment colours are open-ended — "Off White", "Rani Pink", whatever the
    mill called it. Someone at the tag printer must be able to name one."""

    def test_a_shade_that_already_exists_comes_back_instead_of_erroring(self):
        from warehouse.models import ClothColor
        from warehouse.services.master import create_cloth_color

        first = create_cloth_color(name="Off White", hex_code="#faf9f6")
        again = create_cloth_color(name="off white", reuse_existing=True)

        self.assertEqual(again.pk, first.pk)
        self.assertEqual(ClothColor.objects.filter(name__iexact="off white").count(), 1)

    def test_the_colours_screen_still_reports_a_duplicate(self):
        from warehouse.services.master import create_cloth_color

        create_cloth_color(name="Off White")
        with self.assertRaises(GraphQLError):
            create_cloth_color(name="off white")
