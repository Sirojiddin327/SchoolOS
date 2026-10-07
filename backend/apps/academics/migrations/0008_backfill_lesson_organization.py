"""Points every pre-existing lesson, timetable slot and digest at an organization.

The new `organization` columns were added nullable so this backfill could run
against tables that already hold rows. Each one is copied from the row's real
parent — a lesson or slot belongs to whichever organization its class does, a
digest to the organization its reader was working in — and only falls back to
the default school when that parent is somehow NULL itself.
"""

from django.db import migrations

DEFAULT_ORG_SLUG = "main-school"


def _default_org(apps):
    return apps.get_model("organizations", "Organization").objects.filter(slug=DEFAULT_ORG_SLUG).first()


def backfill(apps, schema_editor):
    default_org = _default_org(apps)
    if default_org is None:
        return

    SchoolClass = apps.get_model("schools", "SchoolClass")
    class_orgs = dict(SchoolClass.objects.values_list("id", "organization_id"))
    User = apps.get_model("users", "User")
    user_orgs = dict(User.objects.exclude(active_organization_id=None).values_list("id", "active_organization_id"))

    for model_name, field in (
        ("Lesson", "school_class"),
        ("TimetableSlot", "school_class"),
    ):
        model = apps.get_model("academics", model_name)
        for row in model.objects.filter(organization__isnull=True).only("id", field).iterator():
            organization_id = class_orgs.get(getattr(row, f"{field}_id"))
            if organization_id is not None:
                model.objects.filter(pk=row.pk).update(organization_id=organization_id)

    digest = apps.get_model("academics", "DailyScheduleDigest")
    for row in digest.objects.filter(organization__isnull=True).only("id", "user_id").iterator():
        organization_id = user_orgs.get(row.user_id, default_org.pk)
        digest.objects.filter(pk=row.pk).update(organization_id=organization_id)


def noop(apps, schema_editor):
    """Organization assignment is data, not schema — leave it on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_default_school_and_memberships"),
        ("academics", "0007_remove_dailyscheduledigest_unique_daily_schedule_per_user_and_more"),
        # A lesson's organization is copied from its class's, so the class table
        # must already carry a filled `organization` column by the time this runs.
        ("schools", "0004_backfill_schoolclass_organization"),
        # Likewise a digest's organization comes from its reader's active one.
        ("users", "0007_user_active_organization"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
