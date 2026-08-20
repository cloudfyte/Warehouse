"""
In-app notification helpers. Creates DB Notification records and fires
FCM push to the recipient's registered browser tokens (via Celery task).
"""
from django.contrib.auth import get_user_model
from warehouse.models import Notification, EmployeeProfile

User = get_user_model()


def _push(user_id: int, title: str, message: str, link: str = "") -> None:
    """Fire-and-forget FCM push via Celery. Never raises."""
    try:
        from warehouse.tasks import send_push_task
        data = {"link": link} if link else {}
        send_push_task.delay(user_id, title, message[:200], data)
    except Exception:
        pass


def notify_user(*, user, title: str, message: str, level: str = "INFO", link: str = "") -> Notification:
    n = Notification.objects.create(
        recipient=user,
        title=title,
        message=message,
        level=level,
        link=link,
    )
    _push(user.pk, title, message, link)
    return n


def notify_managers(*, title: str, message: str, level: str = "INFO", link: str = "") -> int:
    """Send in-app notification + FCM push to all SUPER_ADMIN, ADMIN, and MANAGER users."""
    from warehouse.permissions import MANAGEMENT_ROLES
    manager_profiles = list(
        EmployeeProfile.objects.filter(role__in=MANAGEMENT_ROLES, active=True).select_related("user")
    )
    Notification.objects.bulk_create([
        Notification(recipient=p.user, title=title, message=message, level=level, link=link)
        for p in manager_profiles
    ])
    for p in manager_profiles:
        _push(p.user_id, title, message, link)
    return len(manager_profiles)
