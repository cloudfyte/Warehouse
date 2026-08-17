import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required

from warehouse.services.admin import reset_all_data


class ResetAllData(graphene.Mutation):
    class Arguments:
        confirm_phrase = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(self, info, confirm_phrase):
        try:
            reset_all_data(info.context.user, confirm_phrase)
        except GraphQLError:
            raise
        except Exception as e:
            raise GraphQLError(str(e))
        return ResetAllData(
            ok=True,
            message="All data cleared. The system is ready for fresh data entry.",
        )
