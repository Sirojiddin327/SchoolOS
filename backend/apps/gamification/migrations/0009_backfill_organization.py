"""Points the singletons and ledgers that have no richer parent at the default school.

`Streak`, `StudentAchievement`, `XPTransaction`, `SchoolTimeSettings` and
`TeacherTask` all predate the organization column and belong to the one school
this deployment had at the time, so there is only one organization they could
have meant. These tables hold no rows on a fresh install; the backfill exists
so an upgraded database doesn't trip the `AlterField` that follows.
"""

from django.db import migrations

DEFAULT_ORG_SLUG = "main-school"

#: (app_label, model_name, foreign_key or None) in the order it must be filled.
TARGETS = (
    ("gamification", "Streak", None),
    ("gamification", "StudentAchievement", None),
    ("gamification", "XPTransaction", None),
    ("school_config", "SchoolTimeSettings", None),
    ("tasks", "TeacherTask", None),
    ("tasks", "TeacherTaskAssignment", "task"),
    ("duels", "Duel", "school_class"),
    ("duels", "DuelRating", None),
    ("remedial", "RemedialSession", None),
)


def backfill(apps, schema_editor):
    default_org = apps.get_model("organizations", "Organization").objects.filter(
        slug=DEFAULT_ORG_SLUG
    ).first()
    if default_org is None:
        return

    SchoolClass = apps.get_model("schools", "SchoolClass")
    class_orgs = dict(SchoolClass.objects.values_list("id", "organization_id"))

    for app_label, model_name, foreign_key in TARGETS:
        model = apps.get_model(app_label, model_name)
        rows = model.objects.filter(organization__isnull=True)
        if foreign_key is None:
            rows.update(organization_id=default_org.pk)
            continue
        for row in rows.only("id", f"{foreign_key}_id"):
            organization_id = class_orgs.get(getattr(row, f"{foreign_key}_id"))
            if organization_id is not None:
                model.objects.filter(pk=row.pk).update(organization_id=organization_id)


def noop(apps, schema_editor):
    """Organization assignment is data, not schema — leave it on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_default_school_and_memberships"),
        ("gamification", "0008_remove_studentachievement_unique_student_achievement_and_more"),
        ("school_config", "0003_schooltimesettings_organization"),
        ("tasks", "0002_teachertask_organization_and_more"),
        ("duels", "0004_duel_organization_duelrating_organization_and_more"),
        ("remedial", "0003_remedialsession_organization"),
        # A duel inherits its class's organization.
        ("schools", "0004_backfill_schoolclass_organization"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
