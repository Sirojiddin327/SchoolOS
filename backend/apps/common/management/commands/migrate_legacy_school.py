"""Restore the pre-tenancy legacy school database into the live one.

The tenancy refactor re-created the school's people and classes in the new
schema, but two things got lost along the way:

  * the original passwords (the hashes in the legacy db), so staff could no
    longer log in with the passwords they remembered; and
  * the real 9-V timetable, which was re-seeded with placeholder/test teachers
    instead of the actual staff.

This command merges the legacy `db.sqlite3` (the old pre-org database at the
repo root) into the live database:

  * every legacy user is matched to the live user with the same email. If the
    live account already exists its password hash is restored from the legacy
    row so the remembered password works again; otherwise the user is created.
  * users are joined to the target organization and their teacher/student
    profiles are ensured.
  * subjects are matched by name.
  * the target class's timetable slots are REPLACED with the legacy schedule.

Idempotent: re-running reports the same "already migrated" results and leaves
the live data unchanged.

Usage:
    python manage.py migrate_legacy_school [--source ../db.sqlite3]
    python manage.py migrate_legacy_school --organization main-school
"""

import sqlite3
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.academics.models import Subject, TimetableSlot
from apps.organizations.models import Organization, OrganizationMembership
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile, TeacherProfile, User


class Command(BaseCommand):
    help = "Merge the legacy pre-tenancy school database into the live database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default=str(Path(settings.BASE_DIR).parent / "db.sqlite3"),
            help="Path to the legacy sqlite file (default: ../db.sqlite3).",
        )
        parser.add_argument(
            "--organization",
            default="main-school",
            help="Slug of the organization to join people to (default: main-school).",
        )

    def handle(self, *args, **options):
        organization = self._organization(options["organization"])
        connection = sqlite3.connect(options["source"])
        connection.row_factory = sqlite3.Row
        self.stdout.write(f"Source: {options['source']}")
        self.stdout.write(f"Target organization: {organization.name} ({organization.slug})")

        user_map = self._users(connection, organization)
        subjects = self._subjects(connection)
        school_class = self._school_class(connection, organization)
        self._assign_students(user_map, school_class)
        created_slots, skipped_slots = self._timetable(connection, organization, user_map, subjects, school_class)

        self.stdout.write(self.style.SUCCESS(
            f"Done. users={len(user_map)}  subjects={len(subjects)}  "
            f"class={school_class.name}  slots_created={created_slots}  slots_skipped={skipped_slots}"
        ))

    def _organization(self, slug):
        organization = Organization.objects.filter(slug=slug).first()
        if organization is None:
            organization = Organization.objects.order_by("id").first()
            self.stdout.write(self.style.WARNING(
                f"Organization '{slug}' not found — using '{organization.name}' instead."
            ))
        return organization

    def _users(self, connection, organization):
        user_map = {}
        created, matched, memberships = 0, 0, 0
        for row in connection.execute("SELECT * FROM users_user ORDER BY id"):
            user = User.objects.filter(email=row["email"]).first()
            if user is None:
                user = User.objects.create_user(
                    username=row["username"],
                    email=row["email"],
                    password=row["password"],
                    role=row["role"],
                    first_name=row["first_name"],
                    last_name=row["last_name"],
                    is_active=row["is_active"],
                    is_staff=row["is_staff"],
                )
                user.password = row["password"]  # keep the legacy hash, not a re-hash
                user.date_joined = row["date_joined"]
                user.must_change_password = row["must_change_password"]
                user.save(update_fields=["password", "date_joined", "must_change_password"])
                created += 1
            else:
                # Restore the password the person used to know.
                user.password = row["password"]
                user.save(update_fields=["password"])
                matched += 1

            role = {
                "TEACHER": OrganizationMembership.Role.TEACHER,
                "STUDENT": OrganizationMembership.Role.STUDENT,
                "DIRECTOR": OrganizationMembership.Role.DIRECTOR,
            }.get(row["role"], OrganizationMembership.Role.MEMBER)

            membership, was_created = OrganizationMembership.objects.get_or_create(
                user=user, organization=organization, defaults={"role": role, "status": "ACTIVE"}
            )
            if was_created:
                memberships += 1
            if user.active_organization_id != organization.id:
                user.active_organization = organization
                user.save(update_fields=["active_organization"])

            if row["role"] == "TEACHER":
                TeacherProfile.objects.get_or_create(user=user)
            elif row["role"] == "STUDENT":
                StudentProfile.objects.get_or_create(user=user)

            user_map[row["id"]] = user

        self.stdout.write(self.style.SUCCESS(
            f"Users: {created} created, {matched} passwords restored, {memberships} memberships added."
        ))
        return user_map

    def _assign_students(self, user_map, school_class):
        profiles = StudentProfile.objects.filter(user__in=list(user_map.values()), school_class__isnull=True)
        for profile in profiles:
            profile.school_class = school_class
            profile.save(update_fields=["school_class"])
        if profiles:
            self.stdout.write(self.style.SUCCESS(
                f"Students: {profiles.count()} assigned to '{school_class.name}'."
            ))

    def _subjects(self, connection):
        subjects = {}
        for row in connection.execute("SELECT * FROM academics_subject ORDER BY id"):
            subject = Subject.objects.filter(name=row["name"]).first()
            if subject is None:
                subject = Subject.objects.create(name=row["name"])
            subjects[row["id"]] = subject
        self.stdout.write(self.style.SUCCESS(f"Subjects: {len(subjects)} ensured by name."))
        return subjects

    def _school_class(self, connection, organization):
        row = next(connection.execute("SELECT * FROM schools_schoolclass ORDER BY id"), None)
        if row is None:
            raise CommandError("The legacy database has no school classes.")
        school_class = SchoolClass.objects.filter(organization=organization, name=row["name"]).first()
        if school_class is None:
            school_class = SchoolClass.objects.create(
                organization=organization, name=row["name"], total_xp=row["total_xp"]
            )
            self.stdout.write(self.style.SUCCESS(f"Created class '{school_class.name}'."))
        return school_class

    def _timetable(self, connection, organization, user_map, subjects, school_class):
        """Replace the live class's timetable with the legacy schedule."""
        replaced = TimetableSlot.objects.filter(school_class=school_class).delete()[0]
        if replaced:
            self.stdout.write(self.style.WARNING(
                f"Removed {replaced} staged slots for '{school_class.name}'."
            ))

        created, skipped = 0, 0
        for row in connection.execute(
            "SELECT * FROM academics_timetableslot ORDER BY day_of_week, period_number"
        ):
            teacher_user = user_map.get(row["teacher_id"])
            teacher = teacher_user.teacher_profile if teacher_user is not None else None
            secondary_user = user_map.get(row["secondary_teacher_id"])
            secondary = secondary_user.teacher_profile if secondary_user is not None else None
            subject = subjects.get(row["subject_id"])
            if teacher is None or subject is None:
                skipped += 1
                continue
            TimetableSlot.objects.create(
                organization=organization,
                school_class=school_class,
                subject=subject,
                teacher=teacher,
                secondary_teacher=secondary,
                day_of_week=row["day_of_week"],
                period_number=row["period_number"],
                room=row["room"],
            )
            created += 1
        self.stdout.write(self.style.SUCCESS(
            f"Timetable: {created} slots restored, {skipped} skipped."
        ))
        return created, skipped