"""Points every pre-existing attendance row at its lesson's organization.

School attendance belongs to a lesson, and a lesson belongs to exactly one
organization, so there is nothing to guess here — the column is simply copied.
To'garak attendance lives in its own table (`clubs.ClubAttendance`) and is never
backfilled here, which is what keeps the two attendance histories from ever
mixing.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    Lesson = apps.get_model("academics", "Lesson")
    lesson_orgs = dict(Lesson.objects.values_list("id", "organization_id"))

    for model_name, foreign_key in (
        ("Attendance", "lesson"),
        ("AttendanceReminder", "lesson"),
    ):
        model = apps.get_model("attendance", model_name)
        for row in model.objects.filter(organization__isnull=True).only("id", f"{foreign_key}_id"):
            organization_id = lesson_orgs.get(getattr(row, f"{foreign_key}_id"))
            if organization_id is not None:
                model.objects.filter(pk=row.pk).update(organization_id=organization_id)


def noop(apps, schema_editor):
    """Organization assignment is data, not schema — leave it on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_default_school_and_memberships"),
        ("attendance", "0003_attendance_organization_and_more"),
        # An attendance row inherits its lesson's organization, so every lesson
        # must already be pointed at one before this copies it across.
        ("academics", "0008_backfill_lesson_organization"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
