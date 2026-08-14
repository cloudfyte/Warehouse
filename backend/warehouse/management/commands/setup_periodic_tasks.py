"""Create or update the celery-beat periodic tasks in the database."""
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Register scheduled celery-beat tasks in the database"

    def handle(self, *args, **options):
        try:
            from django_celery_beat.models import CrontabSchedule, PeriodicTask
        except ImportError:
            self.stderr.write("django_celery_beat not installed — skipping.")
            return

        # Daily at 8:00 AM IST
        morning, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="8",
            day_of_week="*", day_of_month="*", month_of_year="*",
            timezone="Asia/Kolkata",
        )
        # Daily at 10:00 AM IST
        mid_morning, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="10",
            day_of_week="*", day_of_month="*", month_of_year="*",
            timezone="Asia/Kolkata",
        )

        tasks = [
            ("Daily Low-Stock Alert",    "warehouse.tasks.check_reorder_points",    morning),
            ("Daily Payment Reminders",  "warehouse.tasks.send_payment_reminders",  mid_morning),
        ]
        for name, task_path, schedule in tasks:
            _, created = PeriodicTask.objects.update_or_create(
                name=name,
                defaults={
                    "task": task_path,
                    "crontab": schedule,
                    "enabled": True,
                    "start_time": timezone.now(),
                },
            )
            verb = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{verb} periodic task: {name}"))
