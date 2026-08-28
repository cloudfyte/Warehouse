"""Graphene-Django field conversion overrides.

Two Django field types serialise to strings by default, which the TypeScript
client then treats as numbers and objects:

  DecimalField -> the `Decimal` scalar, delivered as a JSON string. The client
      types these as `number`, so most sites survive on coercion but `+`
      silently concatenates and `.toFixed()` throws.

  JSONField    -> the `JSONString` scalar, delivered as a JSON *string*. This is
      the bug that made the printed tag come out blank: `"[]"` is truthy and has
      length 2, so a guard passed and `for...of` iterated the characters. The
      same defect still reaches CustomRole.tab_permissions, where it would show
      an employee on a custom role nothing but the profile tab.

Fixing it per-field needs an explicit field plus a resolver on every type — 23
of them, and a new model field silently reintroduces the bug. Registering the
conversion once covers the whole schema and keeps it covered.

Importing this module is what installs the overrides; import it before the
DjangoObjectType classes are declared.
"""
import graphene
from django.db import models
from graphene.types.generic import GenericScalar
from graphene_django.converter import convert_django_field


@convert_django_field.register(models.DecimalField)
def convert_decimal_to_float(field, registry=None):
    """Money and measurements reach the client as numbers, not strings."""
    return graphene.Float(
        description=field.help_text or None,
        required=not field.null,
    )


@convert_django_field.register(models.JSONField)
def convert_json_to_generic(field, registry=None):
    """JSON reaches the client as a real object/array, not a string of one."""
    return GenericScalar(
        description=field.help_text or None,
        required=not field.null,
    )
