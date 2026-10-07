"""Points every pre-existing test, activity and their child rows at an organization.

A test or activity's organization is copied from its class, because that is
where it came from — these rows predate the To'garak context, so all of them
are school work by definition. Attempts, submissions and results then inherit
from the test or activity they hang off.
"""

from django.db import migrations

DEFAULT_ORG_SLUG = "main-school"


def backfill(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    default_org = Organization.objects.filter(slug=DEFAULT_ORG_SLUG).first()
    if default_org is None:
        return

    SchoolClass = apps.get_model("schools", "SchoolClass")
    class_orgs = dict(SchoolClass.objects.values_list("id", "organization_id"))

    def adopt(model, foreign_key, sources):
        """Point every still-NULL row's organization at the one its parent has.

        `sources` maps a parent id to an organization id. Parents we can't
        resolve are left NULL for the follow-up `AlterField` to complain about
        loudly, rather than being silently filed under the default school.
        """
        for row in model.objects.filter(organization__isnull=True).only("id", f"{foreign_key}_id"):
            organization_id = sources.get(getattr(row, f"{foreign_key}_id"))
            if organization_id is not None:
                model.objects.filter(pk=row.pk).update(organization_id=organization_id)

    test = apps.get_model("learning", "Test")
    test_orgs = {}
    for row in test.objects.filter(organization__isnull=True).only("id", "school_class_id"):
        organization_id = class_orgs.get(row.school_class_id, default_org.pk)
        test.objects.filter(pk=row.pk).update(organization_id=organization_id)
        test_orgs[row.pk] = organization_id

    activity = apps.get_model("learning", "Activity")
    activity_orgs = {}
    for row in activity.objects.filter(organization__isnull=True).only("id", "school_class_id"):
        organization_id = class_orgs.get(row.school_class_id, default_org.pk)
        activity.objects.filter(pk=row.pk).update(organization_id=organization_id)
        activity_orgs[row.pk] = organization_id

    adopt(apps.get_model("learning", "TestAttempt"), "test", test_orgs)

    submission = apps.get_model("learning", "ActivitySubmission")
    submission_activity = dict(submission.objects.values_list("id", "activity_id"))

    result = apps.get_model("learning", "ActivityResult")
    for row in result.objects.filter(organization__isnull=True).only("id", "submission_id"):
        activity_id = submission_activity.get(row.submission_id)
        organization_id = activity_orgs.get(activity_id)
        if organization_id is not None:
            result.objects.filter(pk=row.pk).update(organization_id=organization_id)


def noop(apps, schema_editor):
    """Organization assignment is data, not schema — leave it on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_default_school_and_memberships"),
        ("learning", "0003_activity_organization_activityresult_organization_and_more"),
        # A test or activity inherits its class's organization.
        ("schools", "0004_backfill_schoolclass_organization"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
