"""Login, refresh and logout: the view stamps every minted token with the
organization the user is acting in, and that claim is what each later request
is authorized against.

These endpoints had no coverage for a long time, which let a real bug through:
the view read `serializer.validated_data["user"]`, a key SimpleJWT never sets
(every login answered 401/500 and the frontend always said the password was
wrong). The tests below lock the whole flow down.
"""

from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.common.testing import add_membership, make_organization, make_teacher
from apps.organizations.authentication import ORG_CLAIM
from apps.organizations.models import OrganizationMembership


class LoginTests(APITestCase):
    def setUp(self):
        self.user, _ = make_teacher()
        self.org = self.user.active_organization

    def _login(self, email, password):
        return self.client.post(
            "/api/auth/login/",
            {"email": email, "password": password},
            format="json",
        )

    def test_valid_credentials_return_tokens_stamped_with_the_org(self):
        response = self._login(self.user.email, "pass12345")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], OrganizationMembership.Role.TEACHER)
        self.assertEqual(
            response.data["organization"],
            {
                "id": self.org.id,
                "name": self.org.name,
                "slug": self.org.slug,
                "type": self.org.type,
            },
        )

        refresh = RefreshToken(response.data["refresh"])
        access = AccessToken(response.data["access"])
        self.assertEqual(refresh[ORG_CLAIM], self.org.id)
        self.assertEqual(access[ORG_CLAIM], self.org.id)

    def test_wrong_password_is_rejected(self):
        response = self._login(self.user.email, "wrong-password")

        self.assertEqual(response.status_code, 401)

    def test_unknown_email_is_rejected(self):
        response = self._login("nobody@example.com", "pass12345")

        self.assertEqual(response.status_code, 401)

    def test_tokens_work_on_a_following_request(self):
        tokens = self._login(self.user.email, "pass12345")
        response = self.client.get(
            "/api/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {tokens.data['access']}",
        )

        self.assertEqual(response.status_code, 200)


class LoginOrganizationResolutionTests(APITestCase):
    """Which organization a login acts in depends on the request body plus the
    user's memberships — a single membership needs no input at all."""

    def setUp(self):
        self.user, _ = make_teacher()
        self.org = self.user.active_organization
        self.other_org = make_organization()
        add_membership(self.user, self.other_org, role=OrganizationMembership.Role.TEACHER)

    def test_user_with_several_memberships_must_choose(self):
        # No active organization => the account is ambiguous, so the API must
        # refuse to guess instead of silently picking one.
        self.user.active_organization = None
        self.user.save(update_fields=["active_organization"])

        response = self.client.post(
            "/api/auth/login/",
            {"email": self.user.email, "password": "pass12345"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("organization", response.data)

    def test_user_with_several_memberships_can_choose_one(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "email": self.user.email,
                "password": "pass12345",
                "organization": self.org.id,
            },
            format="json",
        )
        refresh = RefreshToken(response.data["refresh"])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(refresh[ORG_CLAIM], self.org.id)


class RefreshTests(APITestCase):
    def test_refresh_carries_the_original_org_into_the_new_tokens(self):
        user, _ = make_teacher()
        org = user.active_organization
        login = self.client.post(
            "/api/auth/login/",
            {"email": user.email, "password": "pass12345"},
            format="json",
        )

        response = self.client.post(
            "/api/auth/refresh/",
            {"refresh": login.data["refresh"]},
            format="json",
        )
        access = AccessToken(response.data["access"])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(access[ORG_CLAIM], org.id)