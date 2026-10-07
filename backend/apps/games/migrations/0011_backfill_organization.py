"""Points every pre-existing question pool row at an organization.

A pooled question is subject-wide or class-specific. The class-specific ones
inherit their class's organization; the subject-wide ones have no class to ask,
so they go to the default school — which is where they were already being
served from before this column existed.
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

    question = apps.get_model("games", "PooledQuestion")
    question_orgs = {}
    for row in question.objects.filter(organization__isnull=True).only("id", "school_class_id"):
        organization_id = class_orgs.get(row.school_class_id, default_org.pk)
        question.objects.filter(pk=row.pk).update(organization_id=organization_id)
        question_orgs[row.pk] = organization_id

    served = apps.get_model("games", "PooledQuestionServed")
    for row in served.objects.filter(organization__isnull=True).only("id", "question_id"):
        organization_id = question_orgs.get(row.question_id)
        if organization_id is not None:
            served.objects.filter(pk=row.pk).update(organization_id=organization_id)

    session = apps.get_model("games", "GameSession")
    for row in session.objects.filter(organization__isnull=True).only("id"):
        session.objects.filter(pk=row.pk).update(organization_id=default_org.pk)


def noop(apps, schema_editor):
    """Organization assignment is data, not schema — leave it on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_default_school_and_memberships"),
        ("games", "0010_remove_pooledquestionserved_unique_student_pooled_question_and_more"),
        # A class-specific question inherits its class's organization.
        ("schools", "0004_backfill_schoolclass_organization"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
