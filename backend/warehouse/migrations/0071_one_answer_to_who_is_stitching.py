"""One answer to "who is stitching this".

A job carried both a tailor (an employee) and a karigar (somebody paid by the
piece, staff or not), and every screen had to ask for one and fall back to the
other. A karigar already links to an employee when they are on the payroll, so
that is the single answer: the employee jobs become in-house karigars.
"""
from django.db import migrations


def tailors_become_in_house_karigars(apps, schema_editor):
    StitchingJob = apps.get_model("warehouse", "StitchingJob")
    Karigar = apps.get_model("warehouse", "Karigar")

    for job in StitchingJob.objects.filter(karigar__isnull=True, tailor__isnull=False
                                           ).select_related("tailor__user"):
        employee = job.tailor
        karigar = Karigar.objects.filter(employee=employee).first()
        if karigar is None:
            name = getattr(employee.user, "username", None) or f"Tailor {employee_id(employee)}"
            karigar = Karigar.objects.create(
                name=name,
                kind="IN_HOUSE",
                employee=employee,
                phone=getattr(employee, "phone", "") or "",
                rate_per_piece=job.rate_per_piece or 0,
                active=getattr(employee, "active", True),
            )
        job.karigar = karigar
        job.save(update_fields=["karigar"])


def employee_id(employee):
    return employee.pk


class Migration(migrations.Migration):
    dependencies = [("warehouse", "0070_the_outside_job_is_a_stitching_job")]
    operations = [
        migrations.RunPython(tailors_become_in_house_karigars, migrations.RunPython.noop),
    ]
