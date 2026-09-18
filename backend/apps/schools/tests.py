from rest_framework.test import APITestCase

from apps.common.testing import make_director, make_school_class


class SchoolClassAPITests(APITestCase):
    def test_total_xp_is_exposed_and_read_only(self):
        school_class = make_school_class()
        school_class.total_xp = 75
        school_class.save()

        self.client.force_authenticate(make_director())
        response = self.client.get(f"/api/classes/{school_class.id}/")
        self.assertEqual(response.data["total_xp"], 75)

        self.client.patch(f"/api/classes/{school_class.id}/", {"total_xp": 999}, format="json")
        school_class.refresh_from_db()
        self.assertEqual(school_class.total_xp, 75)
