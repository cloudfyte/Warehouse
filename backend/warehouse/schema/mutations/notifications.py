import graphene
from graphql_jwt.decorators import login_required

from warehouse.models import Notification


class MarkNotificationsRead(graphene.Mutation):
    class Arguments:
        ids = graphene.List(graphene.ID)
        mark_all = graphene.Boolean()

    count = graphene.Int()

    @login_required
    def mutate(self, info, ids=None, mark_all=False):
        qs = Notification.objects.filter(recipient=info.context.user, read=False)
        if not mark_all and ids:
            qs = qs.filter(pk__in=ids)
        count = qs.update(read=True)
        return MarkNotificationsRead(count=count)
