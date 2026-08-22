import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required
from django.contrib.auth import authenticate

from warehouse.services.admin import reset_all_data


class ResetAllData(graphene.Mutation):
    class Arguments:
        confirm_phrase = graphene.String(required=True)
        password = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(self, info, confirm_phrase, password):
        user = info.context.user
        if not authenticate(username=user.username, password=password):
            raise GraphQLError("Incorrect password. Re-authentication required.")
        try:
            reset_all_data(user, confirm_phrase)
        except GraphQLError:
            raise
        except Exception as e:
            raise GraphQLError(str(e))
        return ResetAllData(ok=True, message="All data cleared. The system is ready for fresh data entry.")
