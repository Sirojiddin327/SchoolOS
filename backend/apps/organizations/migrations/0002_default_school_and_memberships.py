"""Creates the default SCHOOL organization and backfills one ACTIVE membership
per existing user, carrying over their current `User.role`.

This is deliberately behaviour-preserving: after it runs, every pre-existing
account has exactly one organization with exactly the role it had before, so
nothing about the running deployment changes. Anything that *reads* a membership
is added in a later migration.
"""

from django.db import migrations

DEFAULT_ORG_SLUG = "main-school"
DEFAULT_ORG_NAME = "Maktab"

#: `User.role` value -> `OrganizationMembership.Role` value. Both are
#: TextChoices of the same three names, so the mapping is the identity; it is
#: spelled out anyway so a future divergence fails loudly here instead of
#: silently producing a role that no longer exists.
ROLE_MAP = {
    "DIRECTOR": "DIRECTOR",
    "TEACHER": "TEACHER",
    "STUDENT": "STUDENT",
}


def create_default_organization(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Organization.objects.get_or_create(
        slug=DEFAULT_ORG_SLUG,
        defaults={"name": DEFAULT_ORG_NAME, "type": "SCHOOL", "is_active": True},
    )


def backfill_memberships(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    User = apps.get_model("users", "User")
    Membership = apps.get_model("organizations", "OrganizationMembership")

    organization = Organization.objects.filter(slug=DEFAULT_ORG_SLUG).first()
    if organization is None:
        return

    for user in User.objects.all().iterator():
        role = ROLE_MAP.get(user.role)
        if role is None:
            continue
        Membership.objects.get_or_create(
            user=user,
            organization=organization,
            defaults={"role": role, "status": "ACTIVE"},
        )


def noop(apps, schema_editor):
    """Memberships and the default organization are real data, not schema —
    they are deliberately left in place on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0001_initial"),
        ("users", "0006_user_avatar"),
    ]

    operations = [
        migrations.RunPython(create_default_organization, noop),
        migrations.RunPython(backfill_memberships, noop),
    ]
