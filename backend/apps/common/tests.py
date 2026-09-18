from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .permissions import IsDirector, IsDirectorOrReadOnly, IsStudent, IsTeacher
from .testing import make_director, make_student, make_teacher


class RolePermissionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.director = make_director()
        self.teacher_user, _ = make_teacher()
        self.student_user, _ = make_student()

    def _request(self, user):
        request = self.factory.get("/")
        request.user = user
        return request

    def test_is_director_allows_only_director(self):
        permission = IsDirector()
        self.assertTrue(permission.has_permission(self._request(self.director), None))
        self.assertFalse(permission.has_permission(self._request(self.teacher_user), None))
        self.assertFalse(permission.has_permission(self._request(self.student_user), None))

    def test_is_teacher_allows_only_teacher(self):
        permission = IsTeacher()
        self.assertFalse(permission.has_permission(self._request(self.director), None))
        self.assertTrue(permission.has_permission(self._request(self.teacher_user), None))
        self.assertFalse(permission.has_permission(self._request(self.student_user), None))

    def test_is_student_allows_only_student(self):
        permission = IsStudent()
        self.assertFalse(permission.has_permission(self._request(self.director), None))
        self.assertFalse(permission.has_permission(self._request(self.teacher_user), None))
        self.assertTrue(permission.has_permission(self._request(self.student_user), None))

    def test_is_director_or_read_only(self):
        permission = IsDirectorOrReadOnly()

        get_request = self.factory.get("/")
        get_request.user = self.teacher_user
        self.assertTrue(permission.has_permission(get_request, None))

        post_request = self.factory.post("/")
        post_request.user = self.teacher_user
        self.assertFalse(permission.has_permission(post_request, None))

        director_post = self.factory.post("/")
        director_post.user = self.director
        self.assertTrue(permission.has_permission(director_post, None))
