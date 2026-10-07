"""Points every user at the default SCHOOL organization.

After the organizations.0002 backfill each user has exactly one membership, so
"the default organization" is the correct active organization for all of them
and the platform's behaviour is unchanged.
"""

from django.db import migrations

DEFAULT_ORG_SLUG = "main-school"


def set_active_organization(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    User = apps.get_model("users", "User")

    organization = Organization.objects.filter(slug=DEFAULT_ORG_SLUG).first()
    if organization is None:
        return

    member_ids = organization.memberships.values_list("user_id", flat=True)
    User.objects.filter(
        active_organization__isnull=True,
        pk__in=list(member_ids),
    ).update(active_organization=organization)


def noop(apps, schema_editor):
    """The pointer is derived state — memberships remain the source of truth,
    so reversing simply leaves it NULL and resolution falls back again."""


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_user_active_organization"),
        ("organizations", "0002_default_school_and_memberships"),
    ]

    operations = [
        migrations.RunPython(set_active_organization, noop),
    ]
