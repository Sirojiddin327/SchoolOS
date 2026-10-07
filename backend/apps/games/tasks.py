import logging

from celery import shared_task
from django.db.models import Count

from apps.academics.models import Subject
from apps.organizations.models import Organization
from apps.schools.models import SchoolClass

from . import services
from .models import PooledQuestion

logger = logging.getLogger(__name__)


@shared_task
def refill_low_pools() -> int:
    """Tops up every existing question bank running low on questions — Celery
    Beat re-runs this on a fixed interval (see CELERY_BEAT_SCHEDULE).

    Only touches banks that already have at least one pooled question; a
    subject that has never been stocked is bootstrapped by a director's manual
    "to'ldirish" action instead, so this task never fires a surprise Gemini call
    for a subject nobody has set up yet. A bank with no `school_class` is the
    subject-wide one and refills the same way.
    """
    low_pools = list(
        PooledQuestion.objects.filter(is_active=True)
        .values("subject", "school_class", "organization")
        .annotate(count=Count("id"))
        .filter(count__lt=services.POOL_LOW_THRESHOLD)
    )

    # Batch-fetch every referenced Subject/SchoolClass once instead of two
    # `.get()` queries per low pool — with N low pools this was 1 + 2N
    # queries, now it's a constant 3 regardless of N. `school_class` is null on
    # the subject-wide banks, so those are looked up as None rather than
    # exploding on a missing key.
    subjects = {
        s.id: s for s in Subject.objects.filter(id__in={row["subject"] for row in low_pools})
    }
    class_ids = {row["school_class"] for row in low_pools if row["school_class"] is not None}
    school_classes = {c.id: c for c in SchoolClass.objects.filter(id__in=class_ids)}
    organizations = {
        o.id: o
        for o in Organization.objects.filter(
            id__in={row["organization"] for row in low_pools if row["organization"] is not None}
        )
    }

    refilled = 0
    for row in low_pools:
        subject = subjects[row["subject"]]
        school_class = school_classes.get(row["school_class"])
        added = services.refill_pool(
            subject=subject,
            school_class=school_class,
            organization=organizations.get(row["organization"]),
        )
        if added:
            refilled += 1
        else:
            logger.warning("Pool refill produced nothing for %s / %s", subject, school_class or "butun fan")

    return refilled
