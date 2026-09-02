"""Adding a size run must be one action, not one product at a time.

A garment varies in size, and often colour on top of that. Entering seven sizes
by hand is where the time goes and where the typos come from.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    ClothColor, EmployeeProfile, FinishedProduct, FinishedProductOption,
    ItemType, WarehouseLocation,
)
from warehouse.services.production import create_product_matrix


class MatrixFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")
        self.item_type = ItemType.objects.create(name="Sherwani", active=True)
        self.green = ClothColor.objects.create(name="Pista Green", active=True)

    def _rows(self, sizes, colours=None, quantity=1):
        """The cartesian product the client builds, as the service receives it."""
        rows = []
        for size in sizes:
            for colour in (colours or [None]):
                options = [{"name": "Size", "value": size}]
                if colour:
                    options.append({"name": "Colour", "value": colour})
                rows.append({
                    "options": options, "quantity": quantity,
                    "cost_price": 500, "sale_price": 1200,
                })
        return rows

    def _create(self, rows, **kw):
        return create_product_matrix(
            user=self.admin, item_type_id=self.item_type.id,
            warehouse_id=self.warehouse.id, rows=rows, **kw)


class GeneratingASizeRun(MatrixFixture):
    def test_a_size_run_becomes_one_product_per_size(self):
        sizes = ["34", "36", "38", "40", "42", "44", "46"]

        created = self._create(self._rows(sizes))

        self.assertEqual(len(created), 7)
        self.assertEqual(
            sorted(p.size for p in created), sorted(sizes),
            "the well-known Size dimension must reach the column tags and filters read")

    def test_two_dimensions_produce_every_combination(self):
        created = self._create(self._rows(["38", "40"], ["Pista Green", "Cream"]))

        self.assertEqual(len(created), 4)
        pairs = {
            (p.size, next(o.value for o in p.options.all() if o.name == "Colour"))
            for p in created
        }
        self.assertEqual(pairs, {("38", "Pista Green"), ("38", "Cream"),
                                 ("40", "Pista Green"), ("40", "Cream")})

    def test_dimensions_are_kept_as_rows_so_any_name_works(self):
        """A dimension with no column of its own still has to survive."""
        created = self._create([{
            "options": [{"name": "Size", "value": "40"},
                        {"name": "Sleeve", "value": "Full"},
                        {"name": "Fit", "value": "Slim"}],
            "quantity": 3, "cost_price": 500, "sale_price": 1200,
        }])

        options = {o.name: o.value for o in created[0].options.all()}
        self.assertEqual(options, {"Size": "40", "Sleeve": "Full", "Fit": "Slim"})

    def test_a_known_colour_is_linked_to_the_master_record(self):
        created = self._create(self._rows(["40"], ["Pista Green"]))

        self.assertEqual(created[0].cloth_color_id, self.green.id)

    def test_an_unknown_colour_stays_an_option_and_is_not_invented(self):
        """Adding to the master colour list is a deliberate act, not a side effect."""
        before = ClothColor.objects.count()

        created = self._create(self._rows(["40"], ["Mango Yellow"]))

        self.assertIsNone(created[0].cloth_color_id)
        self.assertEqual(ClothColor.objects.count(), before)
        self.assertEqual(
            [o.value for o in created[0].options.all() if o.name == "Colour"],
            ["Mango Yellow"])

    def test_each_combination_keeps_its_own_quantity_and_prices(self):
        """A size run is rarely the same count in every size."""
        created = self._create([
            {"options": [{"name": "Size", "value": "38"}], "quantity": 2,
             "cost_price": 400, "sale_price": 900},
            {"options": [{"name": "Size", "value": "40"}], "quantity": 9,
             "cost_price": 550, "sale_price": 1300},
        ])

        by_size = {p.size: p for p in created}
        self.assertEqual(by_size["38"].quantity, 2)
        self.assertEqual(by_size["40"].quantity, 9)
        self.assertEqual(by_size["40"].cost_price, Decimal("550.00"))

    def test_every_generated_product_gets_its_own_barcode(self):
        created = self._create(self._rows(["38", "40", "42"]))

        codes = [p.barcode for p in created]
        self.assertEqual(len(set(codes)), 3)
        self.assertTrue(all(c.isdigit() for c in codes))
        self.assertTrue(all(p.barcode_svg for p in created))


class RefusingBadInput(MatrixFixture):
    def test_no_rows_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._create([])

    def test_a_combination_with_no_dimensions_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._create([{"options": [], "quantity": 1}])

    def test_a_repeated_dimension_in_one_combination_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._create([{
                "options": [{"name": "Size", "value": "40"},
                            {"name": "size", "value": "42"}],
                "quantity": 1,
            }])

    def test_a_negative_quantity_is_refused(self):
        with self.assertRaises(GraphQLError):
            self._create([{"options": [{"name": "Size", "value": "40"}], "quantity": -1}])

    def test_nothing_is_saved_when_one_row_is_bad(self):
        """The whole matrix is one action; a half-created run is worse than none."""
        before = FinishedProduct.objects.count()

        with self.assertRaises(GraphQLError):
            self._create([
                {"options": [{"name": "Size", "value": "38"}], "quantity": 1,
                 "cost_price": 400, "sale_price": 900},
                {"options": [], "quantity": 1},
            ])

        self.assertEqual(FinishedProduct.objects.count(), before)
        self.assertEqual(FinishedProductOption.objects.count(), 0)
