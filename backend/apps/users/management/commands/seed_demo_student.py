from django.core.management.base import BaseCommand, CommandError

from apps.organizations.models import Organization, OrganizationMembership
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile, User

DEMO_EMAIL = "demo.student@example.com"
DEMO_USERNAME = "demo.student"
DEMO_PASSWORD = "student123"
DEMO_CLASS_NAME = "9-Demo"
DEMO_ORGANIZATION_SLUG = "demo-school"


class Command(BaseCommand):
    help = "Create or refresh the demo student account used for local login/demo."

    def handle(self, *args, **options):
        organization, _ = Organization.objects.get_or_create(
            slug=DEMO_ORGANIZATION_SLUG,
            defaults={"name": "Demo maktab", "type": Organization.Type.SCHOOL, "timezone": "Asia/Tashkent"},
        )
        school_class, _ = SchoolClass.objects.get_or_create(
            organization=organization, name=DEMO_CLASS_NAME
        )

        user, created = User.objects.get_or_create(
            username=DEMO_USERNAME,
            defaults={
                "email": DEMO_EMAIL,
                "role": User.Role.STUDENT,
                "first_name": "Demo",
                "last_name": "O'quvchi",
            },
        )
        if not created and user.role != User.Role.STUDENT:
            raise CommandError(f"{DEMO_EMAIL} already exists with role {user.role}.")

        user.email = DEMO_EMAIL
        user.role = User.Role.STUDENT
        user.set_password(DEMO_PASSWORD)
        user.must_change_password = False
        user.save()

        # A student is only "in" an organization through a membership — the role
        # that permission classes read comes from here, not from User.role.
        OrganizationMembership.objects.get_or_create(
            user=user,
            organization=organization,
            defaults={"role": OrganizationMembership.Role.STUDENT},
        )
        user.active_organization = organization
        user.save(update_fields=["active_organization"])

        StudentProfile.objects.update_or_create(
            user=user,
            defaults={"school_class": school_class},
        )

        self.stdout.write(self.style.SUCCESS(f"Demo student ready — login: {DEMO_EMAIL} / {DEMO_PASSWORD}"))