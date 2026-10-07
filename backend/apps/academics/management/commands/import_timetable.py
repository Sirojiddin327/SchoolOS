"""Import the weekly class timetable: create subjects, teacher accounts and
TimetableSlots from a hardcoded schedule. Idempotent — safe to re-run.

Period times are computed from SchoolTimeSettings (08:00 start, 45 min periods,
5 min short breaks, 20 min long break after period 4), which matches the real
school timetable (08:00–08:45, 08:50–09:35, ... 12:25–13:10).
"""

from django.core.management.base import BaseCommand, CommandError

from apps.academics.models import Subject, TimetableSlot
from apps.organizations.models import Organization, OrganizationMembership
from apps.schools.models import SchoolClass
from apps.users.models import TeacherProfile, User

DEFAULT_CLASS = "9-V"
DEFAULT_PASSWORD = "teacher123"
DEFAULT_ORGANIZATION_SLUG = "main-school"

# slug -> display name
TEACHERS = {
    "nishonova.ma": "Nishonova M.A.",
    "abduraxmonov.j": "Abduraxmonov J.",
    "isroilova.mx": "Isroilova M.X.",
    "muxitdinova.gm": "Muxitdinova G.M.",
    "nasriddinova.n": "Nasriddinova N.",
    "mamazokirov.dk": "Mamazokirov D.K.",
    "tojumarov.da": "Tojumarov D.A.",
    "madraximov.dm": "Madraximov D.M.",
    "abdusalomov.zm": "Abdusalomov Z.M.",
    "mamajonova.nm": "Mamajonova N.M.",
    "umarova.nk": "Umarova N.K.",
    "rahmbekova.ha": "Rahimbekova H.A.",
    "usmonov.rd": "Usmonov R.D.",
    "mirzakarimov.n": "Mirzakarimov N.",
    "farmonov.km": "Farmonov K.M.",
    "umuzzakova.kk": "Umuzzakova K.K.",
    "namonova.ma": "Naʼmonova M.A.",
    "azimov.ad": "Azimov A.D.",
    "ikromova.sq": "Ikromova S.Q.",
}

# day_of_week -> [(subject_name, teacher_slug, secondary_teacher_slug_or_None)]
# A "qo'sh dars" (combined/group lesson) lists two teachers: the class is split
# into groups and each group is taught by one of them. All slots belong to the
# single class passed via --class (default 9-V).
SCHEDULE = {
    1: [  # Dushanba
        ("Kelajak soati", "nishonova.ma", None),
        ("Ona tili", "abduraxmonov.j", None),
        ("Algebra", "isroilova.mx", None),
        ("Biologiya", "muxitdinova.gm", None),
        ("Informatika", "nasriddinova.n", "mamazokirov.dk"),
    ],
    2: [  # Seshanba
        ("Fizika", "tojumarov.da", None),
        ("O'zbekiston tarixi", "madraximov.dm", None),
        ("Tarbiya", "abdusalomov.zm", None),
        ("Kimyo", "nishonova.ma", None),
        ("Algebra", "isroilova.mx", None),
        ("Ingliz tili", "mamajonova.nm", "umarova.nk"),
    ],
    3: [  # Chorshanba
        ("Texnologiya", "rahmbekova.ha", "usmonov.rd"),
        ("Informatika", "nasriddinova.n", "mamazokirov.dk"),
        ("Ona tili", "abduraxmonov.j", None),
        ("Jismoniy tarbiya", "mirzakarimov.n", "farmonov.km"),
        ("Algebra", "isroilova.mx", None),
        ("Ingliz tili", "umarova.nk", "mamajonova.nm"),
    ],
    4: [  # Payshanba
        ("Chizmachilik", "umuzzakova.kk", None),
        ("Rus tili", "namonova.ma", "azimov.ad"),
        ("Ona tili", "abduraxmonov.j", None),
        ("Jahon tarixi", "madraximov.dm", None),
        ("Geografiya", "ikromova.sq", None),
        ("Huquq", "abdusalomov.zm", None),
    ],
    5: [  # Juma
        ("Adabiyot", "abduraxmonov.j", None),
        ("Jismoniy tarbiya", "mirzakarimov.n", "farmonov.km"),
        ("Geometriya", "isroilova.mx", None),
        ("Iqtisod", "ikromova.sq", None),
        ("Fizika", "tojumarov.da", None),
        ("Kimyo", "nishonova.ma", None),
    ],
    6: [  # Shanba
        ("Adabiyot", "abduraxmonov.j", None),
        ("Ingliz tili", "mamajonova.nm", "umarova.nk"),
        ("Geometriya", "isroilova.mx", None),
        ("Biologiya", "muxitdinova.gm", None),
        ("O'zbekiston tarixi", "madraximov.dm", None),
        ("Rus tili", "azimov.ad", "namonova.ma"),
    ],
}


class Command(BaseCommand):
    help = "Create subjects, teachers and timetable slots from the embedded schedule."

    def add_arguments(self, parser):
        parser.add_argument("--class", dest="class_name", default=DEFAULT_CLASS)
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument("--must-change", action="store_true")
        parser.add_argument(
            "--organization",
            default=DEFAULT_ORGANIZATION_SLUG,
            help="Timetable qaysi maktabga tegishli (slug).",
        )

    def handle(self, *args, **options):
        class_name = options["class_name"]
        password = options["password"]
        must_change = options["must_change"]

        try:
            organization = Organization.objects.get(slug=options["organization"])
        except Organization.DoesNotExist:
            raise CommandError(
                f"'{options['organization']}' slug'li maktab topilmadi."
            ) from None

        school_class, _ = SchoolClass.objects.get_or_create(
            organization=organization, name=class_name
        )

        for slug, display_name in TEACHERS.items():
            email = f"{slug}@school.uz"
            user, _ = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": slug,
                    "role": User.Role.TEACHER,
                    "first_name": display_name,
                },
            )
            user.role = User.Role.TEACHER
            user.first_name = display_name
            user.set_password(password)
            user.must_change_password = must_change
            user.active_organization = organization
            user.save()
            TeacherProfile.objects.get_or_create(user=user)
            # Teachers are only "in" a school through a membership — that role,
            # not User.role, is what the permission classes read.
            OrganizationMembership.objects.get_or_create(
                user=user,
                organization=organization,
                defaults={"role": OrganizationMembership.Role.TEACHER, "status": "ACTIVE"},
            )

        subjects = []
        for day, slots in SCHEDULE.items():
            for subject_name, _teacher_slug, *_secondary in slots:
                subject, _ = Subject.objects.get_or_create(name=subject_name)
                subjects.append(subject)

        created_slots = 0
        for day, slots in SCHEDULE.items():
            for period, entry in enumerate(slots, start=1):
                subject_name, teacher_slug, *secondary_slugs = entry
                subject = Subject.objects.get(name=subject_name)
                teacher_profile = TeacherProfile.objects.get(user__email=f"{teacher_slug}@school.uz")
                secondary_profile = (
                    TeacherProfile.objects.get(user__email=f"{secondary_slugs[0]}@school.uz")
                    if secondary_slugs and secondary_slugs[0]
                    else None
                )
                TimetableSlot.objects.update_or_create(
                    school_class=school_class,
                    day_of_week=day,
                    period_number=period,
                    defaults={
                        "subject": subject,
                        "teacher": teacher_profile,
                        "secondary_teacher": secondary_profile,
                    },
                )
                created_slots += 1

        self.stdout.write(self.style.SUCCESS(
            f"Timetable ready for {class_name}: "
            f"{len(subjects)} subjects, {len(TEACHERS)} teachers, {created_slots} slots.\n"
            f"Teacher login: <slug>@school.uz / {password}"
        ))