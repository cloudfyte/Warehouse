"""Redraw every stored barcode image at a width a scanner can actually read.

The codes themselves do not change — the same digits, the same tags, the same
products. Only the drawing changes: the narrow bar was 0.2mm, which is 1.6 dots
on a 203dpi thermal head, so the printer rounded every bar on its own and a two
-module bar came out one and a half modules wide. Guns refused the tags.

Run it after the generator's module_width changes. Tags printed before it still
have to be reprinted; paper cannot be patched.
"""
from django.core.management.base import BaseCommand

from warehouse.models import FinishedProduct, ProductSet
from warehouse.services.barcode import generate_barcode_svg


class Command(BaseCommand):
    help = "Regenerate stored barcode SVGs at the current module width."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Say what would change and change nothing.")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        for model in (FinishedProduct, ProductSet):
            done = skipped = 0
            for row in model.objects.exclude(barcode="").iterator(chunk_size=200):
                svg = generate_barcode_svg(row.barcode)
                if not svg:
                    # An empty answer means the library is missing. Keeping the
                    # old drawing beats blanking the tag.
                    skipped += 1
                    continue
                if not dry:
                    model.objects.filter(pk=row.pk).update(barcode_svg=svg)
                done += 1
            self.stdout.write(
                f"{model.__name__}: {done} redrawn"
                + (f", {skipped} left alone (no barcode library)" if skipped else "")
                + (" [dry run]" if dry else ""))
