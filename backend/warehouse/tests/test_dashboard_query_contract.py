"""The dashboard query the frontend actually sends must resolve.

Every service in this app had tests and the retail feature still took
production down: the query fields were never wired into the schema, so the one
query the frontend sends on every page load failed outright. Service tests
cannot see that — only the schema can.
"""
import re
import unittest
from pathlib import Path

from django.test import TestCase

from config.schema import schema

# The backend container mounts ./backend only, so on a dev machine or in CI
# (whole repo checked out) this resolves and the contract is checked; inside
# the container it does not, and that test skips. The explicit field list below
# is the guard that always runs.
_CANDIDATES = [
    Path(__file__).resolve().parents[3] / "frontend" / "app" / "lib" / "graphql.ts",
    Path("/frontend/app/lib/graphql.ts"),
]
FRONTEND = next((p for p in _CANDIDATES if p.exists()), None)


class TheSchemaServesWhatTheFrontendAsks(TestCase):
    def _root_selection(self):
        """The top-level field names in DASHBOARD_QUERY, read from the frontend."""
        source = FRONTEND.read_text(encoding="utf-8")
        block = re.search(r"DASHBOARD_QUERY = `\s*query \w+ \{(.*?)\n  \}\n`", source, re.S)
        self.assertIsNotNone(block, "DASHBOARD_QUERY not found — has graphql.ts moved?")

        names, depth = [], 0
        for line in block.group(1).splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if depth == 0:
                match = re.match(r"([a-zA-Z_][a-zA-Z0-9_]*)", stripped)
                if match:
                    names.append(match.group(1))
            depth += stripped.count("{") - stripped.count("}")
        return names

    @unittest.skipIf(FRONTEND is None, "frontend source not mounted here")
    def test_every_field_the_dashboard_asks_for_exists(self):
        available = set(schema.graphql_schema.query_type.fields)
        missing = [name for name in self._root_selection() if name not in available]

        self.assertEqual(
            missing, [],
            f"The dashboard asks for fields the schema does not serve: {missing}. "
            f"Every page load sends this query, so a missing field is a total outage, "
            f"not a degraded screen."
        )

    def test_the_retail_channel_is_reachable_from_the_schema(self):
        """Pinned separately: this is the one that went out."""
        available = set(schema.graphql_schema.query_type.fields)
        for field in ("retailChannel", "retailStores", "retailDispatches",
                      "retailReturns", "retailReconciliation", "unlinkedFinishedProducts"):
            self.assertIn(field, available)
