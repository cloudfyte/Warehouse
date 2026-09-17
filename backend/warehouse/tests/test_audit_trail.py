"""
Who did what.

The trail used to be written by hand, mutation by mutation, and most authors
did not — cutting, stitching, karigars, stock and settings left no trace at
all. It is written in the middleware now, so the test that matters is that a
mutation nobody thought about still turns up in the log.
"""
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase

from warehouse.models import AuditLog, EmployeeProfile
from warehouse.services.audit_middleware import AuditMiddleware


class AuditTrailFixture(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user("auditadmin", password="x", first_name="")
        EmployeeProfile.objects.create(
            user=self.admin, role=EmployeeProfile.Role.ADMIN, active=True)

    def _run(self, query, user=None):
        from config.schema import schema

        class Ctx:
            pass
        ctx = Ctx()
        ctx.user = user or self.admin
        return schema.execute(query, context=ctx, middleware=[AuditMiddleware()])


class EveryChangeLeavesATrace(AuditTrailFixture):
    def test_the_middleware_is_actually_wired_in(self):
        """A trail nobody switched on is the bug this replaced."""
        self.assertIn(
            "warehouse.services.audit_middleware.AuditMiddleware",
            settings.GRAPHENE["MIDDLEWARE"],
        )

    def test_a_mutation_nobody_remembered_is_still_logged(self):
        result = self._run(
            'mutation { createKarigar(name: "Mumbai Unit", kind: "OUTSIDE", '
            'ratePerPiece: 200) { karigar { id name } } }')
        self.assertIsNone(result.errors)

        row = AuditLog.objects.get()
        self.assertEqual(row.action, "createKarigar")
        self.assertEqual(row.actor, self.admin)
        self.assertEqual(row.actor_name, "auditadmin")
        self.assertEqual(row.entity_type, "Karigar")
        self.assertIn("Mumbai Unit", row.detail["record"])
        self.assertEqual(row.detail["name"], "Mumbai Unit")

    def test_reading_the_data_is_not_a_change_and_is_not_logged(self):
        self._run("{ karigars { id name } }")
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_a_refused_mutation_leaves_no_row(self):
        tailor = User.objects.create_user("audittailor", password="x")
        EmployeeProfile.objects.create(
            user=tailor, role=EmployeeProfile.Role.TAILOR, active=True)
        result = self._run(
            'mutation { createKarigar(name: "Sneaky", kind: "OUTSIDE") { karigar { id } } }',
            user=tailor)
        self.assertTrue(result.errors)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_a_password_never_reaches_the_log(self):
        result = self._run(
            'mutation { createEmployee(username: "newcutter", password: "hunter2", '
            'role: "CUTTING_MASTER", warehouseIds: []) { employee { id } } }')
        self.assertIsNone(result.errors)
        rows = [r for r in AuditLog.objects.all() if "password" in r.detail]
        self.assertTrue(rows, "the mutation should have been logged at all")
        for row in rows:
            self.assertEqual(row.detail["password"], "***")

    def test_a_photo_is_recorded_as_having_been_set_not_pasted_in(self):
        """A data URL is megabytes long and would make the log unreadable."""
        from warehouse.services.audit_middleware import _scrub

        photo = "data:image/jpeg;base64," + ("A" * 50000)
        scrubbed = _scrub({"billPhotos": photo})["billPhotos"]
        self.assertLess(len(scrubbed), 200)
        self.assertIn("characters", scrubbed)
