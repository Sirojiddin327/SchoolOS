"""Cross-tenant isolation: what a caller may see is the *queryset's* job.

Authorization answers "may this person act"; it does not answer "which rows are
in scope". A director permission class on a view whose `get_queryset` returns
every organization's rows still leaks every organization. These tests pin the
second half, per view, so a future queryset rewrite can't quietly reopen it.

Each test builds two real organizations with their own class, teacher and
student, signs the caller in as a director of one, and asserts the other
organization's rows never appear.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.academics.models import Lesson, TimetableSlot
from apps.gamification.models import XPTransaction
from apps.organizations.models import OrganizationMembership
from apps.organizations.services import switch_organization

from .testing import (
    add_membership,
    default_organization,
    make_director,
    make_lesson,
    make_organization,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
    make_timetable_slot,
)


class TwoOrganizationMixin:
    """One director, one teacher and one student in each of two organizations.

    The caller is signed in to `self.home` — the organization under test — so
    anything from `self.away` reaching a response is a leak, not a setup quirk.
    """

    def setUp(self):
        self.client = APIClient()
        self.home = default_organization()
        self.away = make_organization()

        self.home_subject = make_subject("Matematika")
        self.away_subject = make_subject("Biologiya")

        self.home_teacher_user, self.home_teacher = make_teacher(organization=self.home)
        self.away_teacher_user, self.away_teacher = make_teacher(organization=self.away)

        self.home_director = make_director(organization=self.home)
        self.away_director = make_director(organization=self.away)

        self.home_class = make_school_class(organization=self.home, class_teacher=self.home_teacher)
        self.away_class = make_school_class(organization=self.away, class_teacher=self.away_teacher)

        self.home_student_user, self.home_student = make_student(self.home_class, organization=self.home)
        self.away_student_user, self.away_student = make_student(self.away_class, organization=self.away)

    def login_as(self, user):
        self.client.force_authenticate(user)
        return self.client

    @staticmethod
    def rows(response) -> list[dict]:
        """The list in a response, unwrapping DRF's page envelope."""
        data = response.data
        return data["results"] if isinstance(data, dict) and "results" in data else data

    def ids(self, response, key="id"):
        return {row[key] for row in self.rows(response)}


class DirectorReadIsolationTests(TwoOrganizationMixin, TestCase):
    """`is_director` used to read `User.role`, which is one flag for the whole
    account — so being a director anywhere meant being a director everywhere."""

    def test_lessons_are_scoped_to_the_active_organization(self):
        make_lesson(
            school_class=self.home_class, subject=self.home_subject, teacher=self.home_teacher
        )
        make_lesson(school_class=self.away_class, subject=self.away_subject, teacher=self.away_teacher)

        self.login_as(self.home_director)
        response = self.client.get("/api/lessons/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ids(response), {Lesson.objects.get(school_class=self.home_class).id})

    def test_timetable_slots_are_scoped_to_the_active_organization(self):
        make_timetable_slot(
            school_class=self.home_class, subject=self.home_subject, teacher=self.home_teacher
        )
        make_timetable_slot(
            school_class=self.away_class, subject=self.away_subject, teacher=self.away_teacher
        )

        self.login_as(self.home_director)
        response = self.client.get("/api/timetable-slots/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.ids(response), {TimetableSlot.objects.get(school_class=self.home_class).id}
        )

    def test_school_classes_are_scoped_to_the_active_organization(self):
        self.login_as(self.home_director)
        response = self.client.get("/api/classes/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ids(response), {self.home_class.id})

    def test_class_leaderboard_is_scoped_to_the_active_organization(self):
        self.home_class.total_xp = 800
        self.home_class.save(update_fields=["total_xp"])
        self.away_class.total_xp = 950
        self.away_class.save(update_fields=["total_xp"])

        self.login_as(self.home_director)
        response = self.client.get("/api/leaderboard/classes/")

        self.assertEqual(response.status_code, 200)
        # The away class scores higher and still must not be ranked here.
        self.assertEqual([row["name"] for row in self.rows(response)], [self.home_class.name])

    def test_student_leaderboard_is_scoped_to_the_active_organization(self):
        self.home_student.total_xp = 500
        self.home_student.save(update_fields=["total_xp"])
        self.away_student.total_xp = 900
        self.away_student.save(update_fields=["total_xp"])

        self.login_as(self.home_director)
        response = self.client.get("/api/leaderboard/students/")

        self.assertEqual(response.status_code, 200)
        # The away student outranks everyone and still must not appear.
        self.assertEqual([row["name"] for row in self.rows(response)], ["Test User"])

    def test_xp_ledger_is_scoped_to_the_active_organization(self):
        XPTransaction.objects.create(
            organization=self.home, student=self.home_student, amount=10, reason="TEST"
        )
        XPTransaction.objects.create(
            organization=self.away, student=self.away_student, amount=10, reason="TEST"
        )

        self.login_as(self.home_director)
        response = self.client.get("/api/xp/history/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ids(response), {XPTransaction.objects.get(student=self.home_student).id})

    def test_question_pool_status_is_scoped_to_the_active_organization(self):
        from apps.games.models import PooledQuestion

        PooledQuestion.objects.create(
            organization=self.home,
            subject=self.home_subject,
            text="A",
            options=["x", "y"],
            correct_index=0,
        )
        PooledQuestion.objects.create(
            organization=self.away,
            subject=self.away_subject,
            text="B",
            options=["x", "y"],
            correct_index=0,
        )

        self.login_as(self.home_director)
        response = self.client.get("/api/question-pools/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["subject_name"] for row in self.rows(response)], ["Matematika"])


class SwitchingOrganizationTests(TwoOrganizationMixin, TestCase):
    """The real hazard: one account, two organizations, two different roles."""

    def test_a_director_of_the_school_is_not_a_director_of_the_club(self):
        add_membership(
            self.home_director, self.away, role=OrganizationMembership.Role.MEMBER, status="ACTIVE"
        )
        switch_organization(self.home_director, self.away)

        self.assertTrue(self.home_director.role == self.home_director.Role.DIRECTOR)  # legacy flag
        self.assertFalse(self.home_director.is_director)
        self.assertFalse(self.home_director.is_org_director)

        self.login_as(self.home_director)
        self.assertEqual(self.client.get("/api/lessons/").status_code, 200)

        # The club's class is visible now; the school's is not, even though the
        # same account is its director.
        # Reading a class list is open to any member, so the check that matters
        # is which classes come back: the school's must not, even though this
        # same account directs it.
        classes = {row["id"] for row in self.rows(self.client.get("/api/classes/"))}
        # A MEMBER is not a director/teacher/student here, so the class list is
        # narrowed to nothing — but crucially not the school's classes either.
        self.assertNotIn(self.home_class.id, classes)
        self.assertEqual(classes, set())
        self.assertEqual(
            [row["name"] for row in self.rows(self.client.get("/api/leaderboard/classes/"))],
            [self.away_class.name],
        )

    def test_a_club_member_cannot_write_as_a_director(self):
        add_membership(
            self.home_director, self.away, role=OrganizationMembership.Role.MEMBER, status="ACTIVE"
        )
        switch_organization(self.home_director, self.away)

        self.login_as(self.home_director)
        response = self.client.post(
            "/api/timetable-slots/",
            {
                "school_class": self.away_class.id,
                "subject": self.away_subject.id,
                "teacher": self.away_teacher.id,
                "day_of_week": 1,
                "period_number": 1,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_the_teacher_role_follows_the_active_organization_too(self):
        add_membership(
            self.home_teacher_user, self.away, role=OrganizationMembership.Role.MEMBER, status="ACTIVE"
        )
        switch_organization(self.home_teacher_user, self.away)

        self.assertFalse(self.home_teacher_user.is_teacher)
        self.assertFalse(self.home_teacher_user.is_teacher)


class NoOrganizationTests(TwoOrganizationMixin, TestCase):
    """An account with no organization to act in sees nothing, not everything.

    Deliberately a user with *two* memberships: `get_active_membership` falls
    back to "the only membership" when there is exactly one, so a single-org
    account with a cleared `active_organization` is still legitimately a
    director. Ambiguous — two organizations, none chosen — has to fail closed.
    """

    def setUp(self):
        super().setUp()
        add_membership(
            self.home_director, self.away, role=OrganizationMembership.Role.MEMBER, status="ACTIVE"
        )
        self.home_director.active_organization = None
        self.home_director.save(update_fields=["active_organization"])

    def test_an_ambiguous_account_has_no_role(self):
        self.assertIsNone(self.home_director.active_role)
        self.assertFalse(self.home_director.is_director)
        self.assertFalse(self.home_director.is_teacher)
        self.assertFalse(self.home_director.is_student)

    def test_it_is_denied_rather_than_shown_everything(self):
        # `IsDirectorOrReadOnly` reads `active_role`, so an account with no
        # role here is refused at the door — the strongest form of "not
        # everything". The querysets are none() as well, so a view that relaxes
        # its permission still can't leak.
        self.login_as(self.home_director)
        for url in (
            "/api/lessons/",
            "/api/classes/",
            "/api/timetable-slots/",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)


class RolePropertyTests(TwoOrganizationMixin, TestCase):
    """`is_director` & friends are tenant-scoped; `User.role` is not."""

    def test_role_properties_read_the_active_membership(self):
        self.assertTrue(self.home_director.is_director)
        self.assertTrue(self.home_teacher_user.is_teacher)
        self.assertTrue(self.home_student_user.is_student)

    def test_a_director_is_not_a_teacher(self):
        # IsOrgTeacher deliberately excludes managers; is_teacher mirrors it so
        # that a director doesn't quietly gain teacher-only access.
        self.assertTrue(self.home_director.is_director)
        self.assertFalse(self.home_director.is_teacher)
        self.assertTrue(self.home_director.is_org_staff)

    def test_students_are_not_staff(self):
        self.assertTrue(self.home_student_user.is_student)
        self.assertFalse(self.home_student_user.is_org_staff)
        self.assertFalse(self.home_student_user.is_teacher)


class StudentProfileOrganizationTests(TwoOrganizationMixin, TestCase):
    """`StudentProfile` has no organization column — the tenant comes from the
    class, or from the active organization while the student is unplaced."""

    def test_a_placed_student_belongs_to_their_class_organization(self):
        self.assertEqual(self.home_student.organization, self.home)
        self.assertEqual(self.away_student.organization, self.away)

    def test_an_unplaced_student_belongs_to_their_active_organization(self):
        _, unplaced = make_student(None, organization=self.away)
        self.assertIsNone(unplaced.school_class)
        self.assertEqual(unplaced.organization, self.away)


