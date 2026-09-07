"""Colour becomes its own tag component.

It used to be printed as part of "item-info", so removing it from the layout
removed the product name with it. Split apart, the existing drag-and-drop list
can drop or reorder colour like every other row.

Saved layouts name "item-info" and know nothing about "color", so without this
every shop that had a colour line would quietly lose it — the same silent
regression migration 0033 had to repair. The key goes in immediately after
item-info, which is exactly where the colour used to print.
"""
from django.db import migrations

_ITEM_INFO = "item-info"
_COLOR = "color"


def _order(raw):
    """A JSONField can hold a real list, or a JSON string of one."""
    if isinstance(raw, str):
        import json
        try:
            raw = json.loads(raw)
        except ValueError:
            return None
    return list(raw) if isinstance(raw, list) else None


def split_colour_out(apps, schema_editor):
    SystemSettings = apps.get_model("warehouse", "SystemSettings")

    for settings in SystemSettings.objects.all():
        order = _order(settings.tag_component_order)
        # No saved layout means the code default applies, which already has it.
        if not order or _COLOR in order or _ITEM_INFO not in order:
            continue
        # A shop that had the colour switched off keeps it off: the component
        # order is the single switch from here, so it must start out agreeing
        # with what the tag actually printed yesterday.
        if not getattr(settings, "tag_show_color", True):
            continue

        order.insert(order.index(_ITEM_INFO) + 1, _COLOR)
        settings.tag_component_order = order
        settings.save(update_fields=["tag_component_order"])


def merge_colour_back(apps, schema_editor):
    SystemSettings = apps.get_model("warehouse", "SystemSettings")

    for settings in SystemSettings.objects.all():
        order = _order(settings.tag_component_order)
        if not order or _COLOR not in order:
            continue
        settings.tag_component_order = [k for k in order if k != _COLOR]
        settings.save(update_fields=["tag_component_order"])


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0046_retailreturn_retailreturnitem")]
    operations = [migrations.RunPython(split_colour_out, merge_colour_back)]
