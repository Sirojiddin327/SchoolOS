"""Points every pre-existing class at the default SCHOOL organization.

Class names were globally unique before this migration, so assigning them all to
one organization cannot collide with the new per-organization uniqueness rule.
"""

from django.db import migrations

DEFAULT_ORG_SLUG = "main-school"


def backfill(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    SchoolClass = apps.get_model("schools", "SchoolClass")

    organization = Organization.objects.filter(slug=DEFAULT_ORG_SLUG).first()
    if organization is None:
        return

    SchoolClass.objects.filter(organization__isnull=True).update(organization=organization)


def noop(apps, schema_editor):
    """Organization assignment is data, not schema — leave it on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_default_school_and_memberships"),
        ("schools", "0003_schoolclass_organization_alter_schoolclass_name_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
