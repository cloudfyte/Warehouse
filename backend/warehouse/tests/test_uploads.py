"""Photos must survive the trip through a comma-separated column.

Parcel inspection stores several photos in one text field. Every case here is a
photo that was rejected as "Malformed image upload." because the list-splitting
tore a data URL away from its own payload.
"""
import base64
import os

from django.test import TestCase
from graphql import GraphQLError

from warehouse.services.uploads import _split_entries, save_data_url, save_data_urls_csv


def _png_data_url(size=600):
    """A payload big enough to be near-certain to contain '/', as real photos are."""
    return "data:image/png;base64," + base64.b64encode(os.urandom(size)).decode()


class SplittingAListOfPhotos(TestCase):
    def test_a_single_photo_stays_one_entry(self):
        url = _png_data_url()
        self.assertIn("/", url.split(",")[1], "payload should contain a slash for this test to bite")

        self.assertEqual(_split_entries(url), [url])

    def test_several_photos_split_into_one_entry_each(self):
        photos = [_png_data_url() for _ in range(3)]

        self.assertEqual(_split_entries(",".join(photos)), photos)

    def test_stored_paths_still_split(self):
        stored = "parcel-inspections/abc123.png,parcel-inspections/def456.jpg"

        self.assertEqual(_split_entries(stored), stored.split(","))

    def test_a_photo_and_an_already_stored_path_can_sit_side_by_side(self):
        fresh = _png_data_url()
        stored = "parcel-inspections/abc123.png"

        self.assertEqual(_split_entries(f"{stored},{fresh}"), [stored, fresh])


class SavingPhotos(TestCase):
    def test_a_png_photo_is_accepted(self):
        """This is the upload that failed in the parcel inspection form."""
        path = save_data_urls_csv(_png_data_url(), "parcel-inspections")

        self.assertTrue(path.startswith("parcel-inspections/"))
        self.assertTrue(path.endswith(".png"))
        self.assertNotIn(",", path)

    def test_several_photos_all_land(self):
        value = ",".join(_png_data_url() for _ in range(3))

        paths = save_data_urls_csv(value, "parcel-inspections").split(",")

        self.assertEqual(len(paths), 3)
        self.assertEqual(len(set(paths)), 3, "each photo needs its own file")

    def test_a_truncated_data_url_is_still_rejected(self):
        with self.assertRaises(GraphQLError):
            save_data_url("data:image/png;base64,")

    def test_a_disallowed_type_is_still_rejected(self):
        with self.assertRaises(GraphQLError):
            save_data_url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")
