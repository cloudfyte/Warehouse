"""The printed barcode has to survive a 203dpi head and a shop's gun.

This is here because it already went wrong once and cost the shop 600 labels:
the narrow bar was 0.2mm, which is 1.6 printer dots, so each bar was rounded on
its own and a two-module bar printed one and a half modules wide. The digits
were right, the tags looked fine, and nothing could read them.
"""
import re
from decimal import Decimal

from django.test import TestCase

from warehouse.services.barcode import generate_barcode_svg

DOT_203DPI = Decimal("25.4") / 203  # 0.1251mm, a thermal head's finest step
GS1_FLOOR_MM = Decimal("0.250")     # the retail minimum for Code 128


class ThePrintedBarsLandOnWholeDots(TestCase):
    def bar_widths(self, code="6016802"):
        svg = generate_barcode_svg(code)
        if not svg:
            self.skipTest("python-barcode is not installed")
        found = {Decimal(w) for w in re.findall(r'width="([\d.]+)mm"', svg)}
        # The widest rect is the background, not a bar.
        return sorted(found - {max(found)})

    def test_the_narrow_bar_is_wide_enough_for_a_shop_gun(self):
        self.assertGreaterEqual(min(self.bar_widths()), GS1_FLOOR_MM)

    def test_every_bar_is_a_whole_number_of_printer_dots(self):
        """A fractional bar is one the printer rounds, and rounding is the bug."""
        for width in self.bar_widths():
            dots = width / DOT_203DPI
            self.assertAlmostEqual(
                dots, round(dots), places=1,
                msg=f"a {width}mm bar is {dots:.2f} dots — the printer must round it")

    def test_the_bars_keep_their_ratios_once_printed(self):
        """What the decoder reads is the ratio, so that is what must survive."""
        widths = self.bar_widths()
        narrow = widths[0]
        for width in widths:
            printed = round(width / DOT_203DPI) * DOT_203DPI
            printed_narrow = round(narrow / DOT_203DPI) * DOT_203DPI
            self.assertAlmostEqual(
                printed / printed_narrow, width / narrow, places=1,
                msg=f"{width}mm prints at the wrong ratio to the narrow bar")

    def test_it_still_fits_the_tag_it_is_printed_on(self):
        """Wider bars are no use if the label clips them."""
        svg = generate_barcode_svg("6016802")
        if not svg:
            self.skipTest("python-barcode is not installed")
        total = Decimal(re.search(r'<svg[^>]*width="([\d.]+)mm"', svg).group(1))
        # 54mm tag, 13mm left padding for the foil strip, 1.5mm right.
        self.assertLess(total, Decimal("54") - Decimal("13") - Decimal("1.5"))
