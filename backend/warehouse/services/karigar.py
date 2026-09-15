"""Karigars — the people and units that do the stitching, paid by the piece.

They are not staff. They charge per piece, they may be in another city, and
cloth often reaches them without passing through this warehouse at all. That
is why they are their own register rather than a role on an employee.
"""
from decimal import Decimal

from django.db import transaction
from graphql import GraphQLError

from warehouse.models import EmployeeProfile, Karigar, StitchingJob
from warehouse.permissions import require_role

_MANAGE = (EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)


def create_karigar(*, user, name, kind="OUTSIDE", rate_per_piece=0, phone="",
                   whatsapp="", city="", address="", notes=""):
    require_role(user, *_MANAGE)
    name = (name or "").strip()
    if not name:
        raise GraphQLError("Give the karigar a name.")

    kind = (kind or Karigar.Kind.OUTSIDE).upper()
    if kind not in Karigar.Kind.values:
        raise GraphQLError("A karigar is either in-house or an outside unit.")

    rate = Decimal(str(rate_per_piece or 0))
    if rate < 0:
        raise GraphQLError("A rate cannot be negative.")

    if Karigar.objects.filter(name__iexact=name, active=True).exists():
        raise GraphQLError(f"There is already a karigar called {name}.")

    return Karigar.objects.create(
        name=name, kind=kind, rate_per_piece=rate, phone=phone.strip(),
        whatsapp=whatsapp.strip(), city=city.strip(), address=address.strip(),
        notes=notes.strip(),
    )


def update_karigar(*, user, id, **changes):
    require_role(user, *_MANAGE)
    try:
        karigar = Karigar.objects.get(pk=id)
    except Karigar.DoesNotExist as exc:
        raise GraphQLError("Karigar not found.") from exc

    if "rate_per_piece" in changes and changes["rate_per_piece"] is not None:
        rate = Decimal(str(changes.pop("rate_per_piece")))
        if rate < 0:
            raise GraphQLError("A rate cannot be negative.")
        # Jobs already handed out keep the rate they were given at. Changing it
        # here sets what the next job will cost, never what an old one settles
        # for — otherwise editing a rate would silently rewrite history.
        karigar.rate_per_piece = rate

    for field in ("name", "phone", "whatsapp", "city", "address", "notes"):
        value = changes.get(field)
        if value is not None:
            setattr(karigar, field, value.strip())
    if changes.get("kind"):
        kind = changes["kind"].upper()
        if kind not in Karigar.Kind.values:
            raise GraphQLError("A karigar is either in-house or an outside unit.")
        karigar.kind = kind
    if changes.get("active") is not None:
        karigar.active = changes["active"]

    karigar.save()
    return karigar


def pay_karigar(*, user, stitching_job_id, amount):
    """
    Record money paid against one job.

    Pay follows finished work, so a job cannot be paid beyond what it earned —
    a rejected piece was not stitched to standard and is not owed for.
    """
    require_role(user, *_MANAGE)
    amount = Decimal(str(amount or 0))
    if amount <= 0:
        raise GraphQLError("A payment has to be more than zero.")

    with transaction.atomic():
        try:
            job = StitchingJob.objects.select_for_update().get(pk=stitching_job_id)
        except StitchingJob.DoesNotExist as exc:
            raise GraphQLError("Stitching job not found.") from exc

        outstanding = job.amount_due
        if amount > outstanding:
            raise GraphQLError(
                f"{job.job_number} has {outstanding} outstanding "
                f"({job.amount_earned} earned on {job.pieces_completed} finished pieces, "
                f"{job.amount_paid} already paid)."
            )
        job.amount_paid = (job.amount_paid or Decimal("0.00")) + amount
        job.save(update_fields=["amount_paid", "updated_at"])
    return job


def settle_karigar(*, user, karigar_id, amount):
    """
    One payment across everything a karigar is owed, oldest job first.

    Per-job payment answers "what do I owe on this docket". Standing in front
    of a unit at the end of a week, the question is "what do I owe you" — one
    number, one payment, spread over whatever is open. Oldest first, because
    that is the order anybody settling a book would work in.

    Returns (settled, remaining) — the jobs it touched, and any money left over
    because more was offered than was owed.
    """
    require_role(user, *_MANAGE)
    amount = Decimal(str(amount or 0))
    if amount <= 0:
        raise GraphQLError("A payment has to be more than zero.")

    with transaction.atomic():
        try:
            karigar = Karigar.objects.get(pk=karigar_id)
        except Karigar.DoesNotExist as exc:
            raise GraphQLError("Karigar not found.") from exc

        jobs = list(StitchingJob.objects
                    .select_for_update()
                    .filter(karigar=karigar)
                    .order_by("assigned_date", "pk"))
        owed = sum((j.amount_due for j in jobs), Decimal("0.00"))
        if owed <= 0:
            raise GraphQLError(f"Nothing is owed to {karigar.name}.")
        if amount > owed:
            raise GraphQLError(
                f"{karigar.name} is owed {owed}. Paying {amount} would be more than the book says."
            )

        left = amount
        settled = []
        for job in jobs:
            if left <= 0:
                break
            due = job.amount_due
            if due <= 0:
                continue
            part = min(due, left)
            job.amount_paid = (job.amount_paid or Decimal("0.00")) + part
            job.save(update_fields=["amount_paid", "updated_at"])
            settled.append(job)
            left -= part
    return settled, left
