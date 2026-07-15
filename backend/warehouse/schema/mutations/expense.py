import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import Expense, EmployeeProfile, WarehouseLocation
from warehouse.permissions import require_role, MANAGEMENT_ROLES
from warehouse.schema.types import ExpenseType

_STORE_KEEPER = EmployeeProfile.Role.STORE_KEEPER


class CreateExpense(graphene.Mutation):
    class Arguments:
        category     = graphene.String(required=True)
        amount       = graphene.Float(required=True)
        expense_date = graphene.String(required=True)
        description  = graphene.String(required=True)
        warehouse_id = graphene.ID(required=True)
        reference    = graphene.String()

    expense = graphene.Field(ExpenseType)

    @login_required
    def mutate(self, info, category, amount, expense_date, description, warehouse_id, reference=""):
        require_role(info.context.user, *MANAGEMENT_ROLES, _STORE_KEEPER)
        warehouse = WarehouseLocation.objects.get(pk=warehouse_id)
        exp = Expense.objects.create(
            category=category,
            amount=amount,
            expense_date=expense_date,
            description=description,
            reference=reference,
            warehouse=warehouse,
            created_by=info.context.user,
        )
        return CreateExpense(expense=exp)


class UpdateExpense(graphene.Mutation):
    class Arguments:
        id           = graphene.ID(required=True)
        category     = graphene.String()
        amount       = graphene.Float()
        expense_date = graphene.String()
        description  = graphene.String()
        reference    = graphene.String()

    expense = graphene.Field(ExpenseType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(info.context.user, *MANAGEMENT_ROLES)
        exp = Expense.objects.get(pk=id)
        for k, v in kwargs.items():
            if v is not None:
                setattr(exp, k, v)
        exp.save()
        return UpdateExpense(expense=exp)


class DeleteExpense(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @login_required
    def mutate(self, info, id):
        require_role(info.context.user, *MANAGEMENT_ROLES)
        Expense.objects.filter(pk=id).delete()
        return DeleteExpense(ok=True)
