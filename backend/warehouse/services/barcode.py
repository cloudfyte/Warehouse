"""Barcode generation using python-barcode (CODE128 → SVG string)."""
import io
import logging

logger = logging.getLogger(__name__)

try:
    import barcode
    from barcode.writer import SVGWriter
    _BARCODE_AVAILABLE = True
except ImportError:
    _BARCODE_AVAILABLE = False


def generate_barcode_svg(code: str) -> str:
    """Return an SVG string for the given barcode value, or empty string if library not installed."""
    if not _BARCODE_AVAILABLE:
        logger.warning("python-barcode is not installed; no barcode SVG for %s", code)
        return ""
    try:
        cls = barcode.get_barcode_class("code128")
        buf = io.BytesIO()
        instance = cls(code, writer=SVGWriter())
        # module_width is the narrow-bar width, and it has to land on a whole
        # printer dot or the printer rounds each bar separately and the ratios
        # a decoder works from fall apart. A thermal head is 203dpi — 0.1251mm
        # a dot — so the old 0.2mm default was 1.6 dots: a two-module bar came
        # out 1.5 modules wide and a gun could not read the tag at all. 0.25mm
        # is exactly two dots, and is also the GS1 floor for retail scanning.
        # quiet_zone is in modules' terms the same story: 10 modules minimum.
        instance.write(buf, options={"write_text": True, "module_width": 0.25,
                                     "quiet_zone": 2.5, "font_size": 8})
        return buf.getvalue().decode("utf-8")
    except Exception:
        # Swallowing this silently stored an empty SVG and printed a tag with no
        # bars, which only surfaced at the printer. Log it so it is visible.
        logger.exception("Failed to generate barcode SVG for %s", code)
        return ""
