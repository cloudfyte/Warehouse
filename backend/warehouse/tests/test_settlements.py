"""Monthly settlements are pending until the money actually moves.

Booking them paid on the first would show the books lighter than the bank for
the rest of the month.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, Expense, RecurringSettlement, Settlement, WarehouseLocation,
)
from warehouse.services.settlement import (
    create_recurring_settlement, generate_settlements, mark_settlement_paid,
    skip_settlement,
)


class SettlementFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("admin", password="x")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)
        self.warehouse = WarehouseLocation.objects.create(name="Main", code="MAIN")

    def _template(self, name="Ravi (tailor)", kind="SALARY", amount=25000, day=1):
        return create_recurring_settlement(
            user=self.admin, name=name, kind=kind, amount=amount,
            warehouse_id=self.warehouse.id, day_of_month=day)


class GeneratingTheMonth(SettlementFixture):
    def test_active_templates_become_pending_settlements(self):
        self._template("Ravi (tailor)", "SALARY", 25000)
        self._template("Godown rent", "RENT", 40000)

        created = generate_settlements(period=date(2026, 9, 1))

        self.assertEqual(len(created), 2)
        self.assertTrue(all(s.status == Settlement.Status.PENDING for s in created))
        self.assertEqual(sum(s.amount for s in created), Decimal("65000.00"))

    def test_nothing_is_booked_as_an_expense_yet(self):
        """Generating must not move money — that is the whole point of pending."""
        self._template()

        generate_settlements(period=date(2026, 9, 1))

        self.assertEqual(Expense.objects.count(), 0)

    def test_running_twice_does_not_duplicate_the_month(self):
        self._template()

        generate_settlements(period=date(2026, 9, 1))
        second = generate_settlements(period=date(2026, 9, 1))

        self.assertEqual(second, [])
        self.assertEqual(Settlement.objects.count(), 1)

    def test_each_month_gets_its_own_row(self):
        self._template()

        generate_settlements(period=date(2026, 9, 1))
        generate_settlements(period=date(2026, 10, 1))

        self.assertEqual(Settlement.objects.count(), 2)

    def test_an_inactive_template_is_skipped(self):
        template = self._template()
        template.active = False
        template.save(update_fields=["active"])

        self.assertEqual(generate_settlements(period=date(2026, 9, 1)), [])

    def test_a_due_day_past_the_end_of_the_month_is_clamped(self):
        """A 31st salary in February has to land on a day that exists."""
        template = self._template(day=1)
        RecurringSettlement.objects.filter(pk=template.pk).update(day_of_month=31)

        created = generate_settlements(period=date(2026, 2, 1))

        self.assertEqual(created[0].due_date, date(2026, 2, 28))

    def test_the_amount_is_copied_not_referenced(self):
        """A later pay rise must not restate what last month said was due."""
        template = self._template(amount=25000)
        created = generate_settlements(period=date(2026, 9, 1))[0]

        template.amount = Decimal("30000.00")
        template.save(update_fields=["amount"])

        created.refresh_from_db()
        self.assertEqual(created.amount, Decimal("25000.00"))


class ConfirmingPayment(SettlementFixture):
    def _pending(self, amount=25000):
        self._template(amount=amount)
        return generate_settlements(period=date(2026, 9, 1))[0]

    def test_marking_paid_books_the_expense(self):
        settlement = self._pending()

        mark_settlement_paid(user=self.admin, id=settlement.id, paid_on=date(2026, 9, 3))

        settlement.refresh_from_db()
        self.assertEqual(settlement.status, Settlement.Status.PAID)
        self.assertIsNotNone(settlement.expense)
        self.assertEqual(settlement.expense.amount, Decimal("25000.00"))
        self.assertEqual(settlement.expense.expense_date, date(2026, 9, 3))
        self.assertEqual(settlement.expense.category, Expense.Category.LABOR)

    def test_paying_a_different_amount_is_what_the_books_record(self):
        settlement = self._pending(amount=25000)

        mark_settlement_paid(user=self.admin, id=settlement.id, amount=22000)

        settlement.refresh_from_db()
        self.assertEqual(settlement.amount, Decimal("22000.00"))
        self.assertEqual(settlement.expense.amount, Decimal("22000.00"))

    def test_it_cannot_be_paid_twice(self):
        settlement = self._pending()
        mark_settlement_paid(user=self.admin, id=settlement.id)

        with self.assertRaises(GraphQLError):
            mark_settlement_paid(user=self.admin, id=settlement.id)

        self.assertEqual(Expense.objects.count(), 1)

    def test_a_store_keeper_cannot_confirm_a_payment(self):
        settlement = self._pending()
        keeper = User.objects.create_user("keeper", password="x")
        profile = EmployeeProfile.objects.create(
            user=keeper, role=EmployeeProfile.Role.STORE_KEEPER, active=True)
        profile.locations.add(self.warehouse)

        with self.assertRaises(GraphQLError):
            mark_settlement_paid(user=keeper, id=settlement.id)

        self.assertEqual(Expense.objects.count(), 0)

    def test_a_skipped_month_books_nothing(self):
        settlement = self._pending()

        skip_settlement(user=self.admin, id=settlement.id, notes="Left in August")

        settlement.refresh_from_db()
        self.assertEqual(settlement.status, Settlement.Status.SKIPPED)
        self.assertEqual(Expense.objects.count(), 0)

    def test_a_paid_settlement_cannot_be_skipped(self):
        settlement = self._pending()
        mark_settlement_paid(user=self.admin, id=settlement.id)

        with self.assertRaises(GraphQLError):
            skip_settlement(user=self.admin, id=settlement.id)
