"""
Every change, recorded without anybody remembering to record it.

The audit trail used to depend on a service author calling log_action(), and
six modules out of twenty-eight did. So the log showed purchase orders and
sales and nothing about cutting, stitching, karigars, stock or settings — which
is not an audit trail, it is a sample. Every write in this app arrives as one
GraphQL mutation, so the log is written where they all pass instead.
"""
import logging

from django.db import models
from graphql import OperationType

from warehouse.models import AuditLog

logger = logging.getLogger(__name__)

# Never store these, whatever they are called.
_SECRET = ("password", "token", "secret", "apikey", "api_key", "authorization")
# A photo arrives as a data URL megabytes long. The log keeps that it was set.
_MAX_TEXT = 200


def _scrub(value, depth=0):
    if depth > 3:
        return "…"
    if isinstance(value, dict):
        return {k: ("***" if any(s in k.lower() for s in _SECRET) else _scrub(v, depth + 1))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        if len(value) > 5:
            return f"{len(value)} items"
        return [_scrub(v, depth + 1) for v in value]
    if isinstance(value, str) and len(value) > _MAX_TEXT:
        return f"{value[:60]}… ({len(value)} characters)"
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)[:_MAX_TEXT]


def _record(payload):
    """The row the mutation actually touched, for the log to point at."""
    for value in vars(payload).values() if hasattr(payload, "__dict__") else []:
        if isinstance(value, models.Model):
            return value
        if isinstance(value, (list, tuple)) and value and isinstance(value[0], models.Model):
            return value[0]
    return None


class AuditMiddleware:
    """Writes one audit row per successful mutation."""

    def resolve(self, next_, root, info, **args):
        result = next_(root, info, **args)
        # Only the top-level mutation field: its children are just the payload
        # being read back, and logging those would bury the change itself.
        if root is not None or info.operation.operation != OperationType.MUTATION:
            return result
        try:
            self._log(info, args, result)
        except Exception:  # an audit row must never break the write it describes
            logger.exception("Could not write the audit row for %s", info.field_name)
        return result

    def _log(self, info, args, payload):
        user = getattr(info.context, "user", None)
        actor = user if (user and user.is_authenticated) else None

        detail = _scrub(dict(args))
        # Signing in is the one change where the person is not authenticated
        # yet, so the name comes off the attempt itself.
        attempted = args.get("username") if isinstance(args.get("username"), str) else ""

        record = _record(payload)
        if record is not None:
            detail["record"] = str(record)[:_MAX_TEXT]

        AuditLog.objects.create(
            entity_type=type(record).__name__ if record is not None else "",
            entity_id=str(record.pk) if record is not None else "",
            action=info.field_name,
            actor=actor,
            actor_name=((actor.get_full_name() or actor.username) if actor
                        else (attempted or "Signed out")),
            detail=detail,
        )
