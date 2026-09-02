"""Monthly settlements — salaries, rent and anything else that comes round.

A settlement is created pending on the first of the month and only becomes an
expense when someone confirms the money moved. Booking it as paid the moment it
is generated would show the books lighter than the bank all month.
"""
import calendar
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, Expense, RecurringSettlement, Settlement,
)
from warehouse.permissions import accessible_warehouses, get_scoped, get_warehouse, require_role


def _period_start(when=None):
    today = when or timezone.now().date()
    return today.replace(day=1)


def _due_date(period, day_of_month):
    """The template's day, clamped to months that are shorter than it."""
    last = calendar.monthrange(period.year, period.month)[1]
    return period.replace(day=min(max(int(day_of_month or 1), 1), last))


def generate_settlements(*, period=None, user=None):
    """
    Create this month's pending settlements from the active templates.

    Idempotent: the unique constraint on (recurring, period) means running it
    twice — a retried task, a second deploy — adds nothing the second time.
    """
    period = _period_start(period)

    templates = RecurringSettlement.objects.filter(active=True).select_related("warehouse")
    if user is not None:
        templates = templates.filter(warehouse__in=accessible_warehouses(user))

    created = []
    with transaction.atomic():
        existing = set(
            Settlement.objects.filter(period=period, recurring__isnull=False)
            .values_list("recurring_id", flat=True)
        )
        for template in templates:
            if template.pk in existing:
                continue
            created.append(Settlement.objects.create(
                recurring=template,
                name=template.name,
                kind=template.kind,
                amount=template.amount,
                period=period,
                due_date=_due_date(period, template.day_of_month),
                warehouse=template.warehouse,
                notes=template.notes,
            ))
    return created


def mark_settlement_paid(*, user, id, paid_on=None, payment_method=None,
                         reference="", amount=None):
    """
    Confirm the money moved, and book the expense that records it.

    The expense is created here and nowhere else, so a settlement marked paid
    and the books can never disagree about whether it was.
    """
    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)

    with transaction.atomic():
        settlement = get_scoped(user, Settlement, id, lock=True)
        if settlement.status == Settlement.Status.PAID:
            raise GraphQLError(f"{settlement.settlement_number} is already marked paid.")

        paid_amount = Decimal(str(amount)) if amount is not None else settlement.amount
        if paid_amount <= 0:
            raise GraphQLError("A payment has to be more than zero.")

        settlement.amount = paid_amount
        settlement.paid_on = paid_on or timezone.now().date()
        settlement.payment_method = payment_method or settlement.payment_method
        settlement.reference = (reference or "").strip()
        settlement.status = Settlement.Status.PAID
        settlement.expense = Expense.objects.create(
            category=RecurringSettlement.EXPENSE_CATEGORY.get(settlement.kind, "OTHER"),
            amount=paid_amount,
            expense_date=settlement.paid_on,
            description=f"{settlement.get_kind_display()} — {settlement.name} ({settlement.period:%B %Y})",
            reference=settlement.reference or settlement.settlement_number,
            payment_method=settlement.payment_method,
            warehouse=settlement.warehouse,
            created_by=user,
        )
        settlement.save(update_fields=[
            "amount", "paid_on", "payment_method", "reference", "status", "expense",
        ])
    return settlement


def skip_settlement(*, user, id, notes=""):
    """Close a month's settlement without paying it — someone left, a shop shut."""
    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)

    with transaction.atomic():
        settlement = get_scoped(user, Settlement, id, lock=True)
        if settlement.status == Settlement.Status.PAID:
            raise GraphQLError("This settlement is already paid; it cannot be skipped.")
        settlement.status = Settlement.Status.SKIPPED
        settlement.notes = (notes or settlement.notes or "").strip()
        settlement.save(update_fields=["status", "notes"])
    return settlement


def create_recurring_settlement(*, user, name, kind, amount, warehouse_id,
                                employee_id=None, day_of_month=1, notes=""):
    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)

    warehouse = get_warehouse(user, warehouse_id)
    value = Decimal(str(amount))
    if value <= 0:
        raise GraphQLError("Amount has to be more than zero.")
    if kind not in RecurringSettlement.Kind.values:
        raise GraphQLError("Unknown settlement kind.")

    return RecurringSettlement.objects.create(
        name=name.strip(),
        kind=kind,
        amount=value,
        employee_id=employee_id,
        warehouse=warehouse,
        day_of_month=min(max(int(day_of_month or 1), 1), 28),
        notes=(notes or "").strip(),
    )


def update_recurring_settlement(*, user, id, **changes):
    require_role(user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)

    template = get_scoped(user, RecurringSettlement, id, lock=True)
    changes = {k: v for k, v in changes.items() if v is not None}
    if not changes:
        raise GraphQLError("Nothing to update.")

    if "amount" in changes:
        value = Decimal(str(changes["amount"]))
        if value <= 0:
            raise GraphQLError("Amount has to be more than zero.")
        changes["amount"] = value
    if "day_of_month" in changes:
        changes["day_of_month"] = min(max(int(changes["day_of_month"]), 1), 28)
    if "kind" in changes and changes["kind"] not in RecurringSettlement.Kind.values:
        raise GraphQLError("Unknown settlement kind.")

    for field, value in changes.items():
        setattr(template, field, value.strip() if isinstance(value, str) else value)
    template.save()
    return template
