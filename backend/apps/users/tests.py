import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import make_director, make_school_class, make_student, make_teacher

from . import services
from .models import StudentProfile, User


def _png_file(name: str = "avatar.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), color="red").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _csv_file(content: str) -> io.BytesIO:
    file_obj = io.BytesIO(content.encode("utf-8"))
    file_obj.name = "students.csv"
    return file_obj


class BulkImportStudentsServiceTests(TestCase):
    def setUp(self):
        self.school_class = make_school_class(name="9-Bulk")

    def test_creates_a_user_and_student_profile_per_valid_row(self):
        file_obj = _csv_file(
            "full_name,phone,class,username\nAnvar Karimov,+998901112233,9-Bulk,\n"
        )
        result = services.bulk_import_students(file_obj)

        self.assertEqual(len(result.created), 1)
        self.assertEqual(len(result.errors), 0)
        created = result.created[0]
        self.assertTrue(User.objects.filter(email=created.login_email, role=User.Role.STUDENT).exists())
        profile = StudentProfile.objects.get(user__email=created.login_email)
        self.assertEqual(profile.school_class, self.school_class)

    def test_generated_password_is_never_stored_in_plaintext(self):
        file_obj = _csv_file("full_name,phone,class,username\nAnvar Karimov,,9-Bulk,\n")
        result = services.bulk_import_students(file_obj)

        user = User.objects.get(email=result.created[0].login_email)
        self.assertNotEqual(user.password, result.created[0].temporary_password)
        self.assertTrue(user.check_password(result.created[0].temporary_password))

    def test_new_students_must_change_password(self):
        file_obj = _csv_file("full_name,phone,class,username\nAnvar Karimov,,9-Bulk,\n")
        result = services.bulk_import_students(file_obj)

        user = User.objects.get(email=result.created[0].login_email)
        self.assertTrue(user.must_change_password)

    def test_missing_full_name_is_a_row_error_not_a_crash(self):
        file_obj = _csv_file("full_name,phone,class,username\n,,9-Bulk,\n")
        result = services.bulk_import_students(file_obj)

        self.assertEqual(len(result.created), 0)
        self.assertEqual(result.errors[0]["message"], "full_name is required.")

    def test_nonexistent_class_is_a_row_error(self):
        file_obj = _csv_file("full_name,phone,class,username\nAnvar Karimov,,Nonexistent,\n")
        result = services.bulk_import_students(file_obj)

        self.assertEqual(len(result.created), 0)
        self.assertIn("does not exist", result.errors[0]["message"])

    def test_one_bad_row_does_not_block_the_rest_of_the_batch(self):
        file_obj = _csv_file(
            "full_name,phone,class,username\n"
            "Anvar Karimov,,9-Bulk,\n"
            ",,9-Bulk,\n"
            "Nigora Yusupova,,9-Bulk,\n"
        )
        result = services.bulk_import_students(file_obj)

        self.assertEqual(len(result.created), 2)
        self.assertEqual(len(result.errors), 1)

    def test_duplicate_generated_emails_get_a_unique_suffix(self):
        file_obj = _csv_file(
            "full_name,phone,class,username\nAnvar Karimov,,9-Bulk,\nAnvar Karimov,,9-Bulk,\n"
        )
        result = services.bulk_import_students(file_obj)

        emails = {item.login_email for item in result.created}
        self.assertEqual(len(emails), 2)

    def test_parses_xlsx_files(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["full_name", "phone", "class", "username"])
        sheet.append(["Bekzod Aliyev", "+998901112235", "9-Bulk", ""])
        buffer = io.BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        buffer.name = "students.xlsx"

        result = services.bulk_import_students(buffer)

        self.assertEqual(len(result.created), 1)
        self.assertEqual(result.created[0].full_name, "Bekzod Aliyev")


class BulkImportStudentsAPITests(APITestCase):
    def setUp(self):
        self.school_class = make_school_class(name="9-BulkAPI")

    def _upload(self):
        file_obj = _csv_file("full_name,phone,class,username\nAnvar Karimov,,9-BulkAPI,\n")
        return self.client.post("/api/students/bulk-import/", {"file": file_obj}, format="multipart")

    def test_director_can_bulk_import(self):
        self.client.force_authenticate(make_director())
        response = self._upload()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created_count"], 1)

    def test_teacher_cannot_bulk_import(self):
        teacher_user, _profile = make_teacher()
        self.client.force_authenticate(teacher_user)
        response = self._upload()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_response_exposes_only_the_plaintext_temp_password_never_a_hash(self):
        self.client.force_authenticate(make_director())
        response = self._upload()
        created = response.data["created"][0]
        self.assertEqual(
            set(created.keys()),
            {"row", "full_name", "login_email", "temporary_password", "school_class"},
        )
        self.assertFalse(created["temporary_password"].startswith("pbkdf2"))


class ChangePasswordAPITests(APITestCase):
    def setUp(self):
        self.user, _profile = make_student()
        self.user.set_password("old-password-123")
        self.user.must_change_password = True
        self.user.save()

    def test_correct_current_password_changes_it_and_clears_the_flag(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "old-password-123", "new_password": "new-password-456"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)
        self.assertTrue(self.user.check_password("new-password-456"))

    def test_wrong_current_password_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "totally-wrong", "new_password": "new-password-456"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.must_change_password)


class MeEndpointTests(APITestCase):
    def test_student_sees_their_total_xp(self):
        student_user, profile = make_student()
        profile.total_xp = 42
        profile.save()

        self.client.force_authenticate(student_user)
        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.data["total_xp"], 42)

    def test_non_student_has_no_total_xp(self):
        self.client.force_authenticate(make_director())
        response = self.client.get("/api/auth/me/")
        self.assertIsNone(response.data["total_xp"])


class AvatarAPITests(APITestCase):
    def setUp(self):
        self.user, _profile = make_student()

    def test_upload_sets_avatar_url_on_me(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/auth/avatar/", {"avatar": _png_file()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["avatar_url"])

        me = self.client.get("/api/auth/me/")
        self.assertIsNotNone(me.data["avatar_url"])

    def test_uploading_again_replaces_the_previous_file(self):
        self.client.force_authenticate(self.user)
        self.client.post("/api/auth/avatar/", {"avatar": _png_file("first.png")}, format="multipart")
        self.user.refresh_from_db()
        first_name = self.user.avatar.name

        self.client.post("/api/auth/avatar/", {"avatar": _png_file("second.png")}, format="multipart")
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.avatar.name, first_name)
        self.user.avatar.delete(save=True)

    def test_non_image_upload_is_rejected(self):
        self.client.force_authenticate(self.user)
        bogus = SimpleUploadedFile("not-an-image.txt", b"just text", content_type="text/plain")
        response = self.client.post("/api/auth/avatar/", {"avatar": bogus}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_clears_the_avatar(self):
        self.client.force_authenticate(self.user)
        self.client.post("/api/auth/avatar/", {"avatar": _png_file()}, format="multipart")
        response = self.client.delete("/api/auth/avatar/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["avatar_url"])


class StudentSerializerTests(APITestCase):
    def test_student_detail_exposes_read_only_total_xp(self):
        director = make_director()
        _, profile = make_student()
        profile.total_xp = 15
        profile.save()

        self.client.force_authenticate(director)
        response = self.client.get(f"/api/students/{profile.id}/")
        self.assertEqual(response.data["total_xp"], 15)

        self.client.patch(f"/api/students/{profile.id}/", {"total_xp": 9999}, format="json")
        profile.refresh_from_db()
        self.assertEqual(profile.total_xp, 15)
