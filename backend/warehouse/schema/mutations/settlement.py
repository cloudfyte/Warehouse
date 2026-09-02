import graphene
from graphql_jwt.decorators import login_required

from warehouse.services.audit import log_action
from warehouse.services.settlement import (
    create_recurring_settlement, generate_settlements, mark_settlement_paid,
    skip_settlement, update_recurring_settlement,
)
from warehouse.schema.types import RecurringSettlementType, SettlementType


class CreateRecurringSettlement(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        kind = graphene.String(required=True)
        amount = graphene.Float(required=True)
        warehouse_id = graphene.ID(required=True)
        employee_id = graphene.ID()
        day_of_month = graphene.Int()
        notes = graphene.String()

    recurring_settlement = graphene.Field(RecurringSettlementType)

    @login_required
    def mutate(self, info, **kwargs):
        return CreateRecurringSettlement(
            recurring_settlement=create_recurring_settlement(user=info.context.user, **kwargs))


class UpdateRecurringSettlement(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        kind = graphene.String()
        amount = graphene.Float()
        day_of_month = graphene.Int()
        active = graphene.Boolean()
        notes = graphene.String()

    recurring_settlement = graphene.Field(RecurringSettlementType)

    @login_required
    def mutate(self, info, id, **kwargs):
        return UpdateRecurringSettlement(
            recurring_settlement=update_recurring_settlement(user=info.context.user, id=id, **kwargs))


class GenerateSettlements(graphene.Mutation):
    """Raise this month's pending settlements by hand, rather than waiting for the 1st."""
    class Arguments:
        period = graphene.Date()

    settlements = graphene.List(SettlementType)

    @login_required
    def mutate(self, info, period=None):
        return GenerateSettlements(
            settlements=generate_settlements(period=period, user=info.context.user))


class MarkSettlementPaid(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        paid_on = graphene.Date()
        payment_method = graphene.String()
        reference = graphene.String()
        amount = graphene.Float()

    settlement = graphene.Field(SettlementType)

    @login_required
    def mutate(self, info, id, **kwargs):
        settlement = mark_settlement_paid(user=info.context.user, id=id, **kwargs)
        try:
            log_action(
                entity_type="Settlement", entity_id=settlement.pk, action="PAID",
                actor=info.context.user,
                detail={"number": settlement.settlement_number,
                        "name": settlement.name, "amount": str(settlement.amount)},
            )
        except Exception:
            pass
        return MarkSettlementPaid(settlement=settlement)


class SkipSettlement(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        notes = graphene.String()

    settlement = graphene.Field(SettlementType)

    @login_required
    def mutate(self, info, id, notes=""):
        return SkipSettlement(
            settlement=skip_settlement(user=info.context.user, id=id, notes=notes))
