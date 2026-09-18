"""Bulk student onboarding from a director-uploaded CSV/XLSX spreadsheet.

Expected columns (header row, case-insensitive): full_name, phone, class,
username (optional). ~700 students is the target scale (see spec), so this
is written as a best-effort batch: one bad row never blocks the rest.
"""

import csv
import io
import re
import secrets
import string
from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from django.db import transaction

from apps.schools.models import SchoolClass

from .models import StudentProfile

User = get_user_model()

STUDENT_EMAIL_DOMAIN = "student.schoolos.local"
REQUIRED_COLUMNS = ("full_name", "class")


@dataclass
class ImportedStudent:
    row: int
    full_name: str
    login_email: str
    temporary_password: str
    school_class: str


@dataclass
class BulkImportResult:
    created: list[ImportedStudent] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)


def _slugify(full_name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", ".", full_name.strip().lower()).strip(".")
    return slug or "student"


def _unique_login_email(base_slug: str) -> str:
    candidate = f"{base_slug}@{STUDENT_EMAIL_DOMAIN}"
    suffix = 1
    while User.objects.filter(email__iexact=candidate).exists():
        suffix += 1
        candidate = f"{base_slug}{suffix}@{STUDENT_EMAIL_DOMAIN}"
    return candidate


def _generate_temp_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(10))


def _normalize_row(raw_row: dict) -> dict:
    return {(key or "").strip().lower(): (value or "").strip() for key, value in raw_row.items()}


def _parse_csv(file) -> list[dict]:
    text = io.TextIOWrapper(file, encoding="utf-8-sig")
    return [_normalize_row(row) for row in csv.DictReader(text)]


def _parse_xlsx(file) -> list[dict]:
    from openpyxl import load_workbook

    workbook = load_workbook(file, read_only=True, data_only=True)
    sheet = workbook.active
    rows = sheet.iter_rows(values_only=True)
    header = [str(cell or "").strip().lower() for cell in next(rows)]

    parsed = []
    for values in rows:
        if not any(values):
            continue
        row = {header[i]: values[i] for i in range(min(len(header), len(values)))}
        parsed.append(_normalize_row({k: "" if v is None else str(v) for k, v in row.items()}))
    return parsed


def _parse_rows(file) -> list[dict]:
    filename = (getattr(file, "name", "") or "").lower()
    if filename.endswith(".xlsx"):
        return _parse_xlsx(file)
    return _parse_csv(file)


@transaction.atomic
def bulk_import_students(file) -> BulkImportResult:
    result = BulkImportResult()
    rows = _parse_rows(file)

    for index, row in enumerate(rows, start=2):  # row 1 is the header
        full_name = row.get("full_name", "")
        class_name = row.get("class", "")

        if not full_name:
            result.errors.append({"row": index, "message": "full_name is required."})
            continue
        if not class_name:
            result.errors.append({"row": index, "message": "class is required."})
            continue

        school_class = SchoolClass.objects.filter(name__iexact=class_name).first()
        if school_class is None:
            result.errors.append({"row": index, "message": f"Class '{class_name}' does not exist."})
            continue

        base_slug = row.get("username") or _slugify(full_name)
        login_email = _unique_login_email(base_slug)
        temp_password = _generate_temp_password()

        first_name, _sep, last_name = full_name.partition(" ")

        user = User.objects.create_user(
            username=login_email,
            email=login_email,
            password=temp_password,
            role=User.Role.STUDENT,
            first_name=first_name,
            last_name=last_name,
            must_change_password=True,
        )
        StudentProfile.objects.create(
            user=user, school_class=school_class, phone_number=row.get("phone", "")
        )

        result.created.append(
            ImportedStudent(
                row=index,
                full_name=full_name,
                login_email=login_email,
                temporary_password=temp_password,
                school_class=school_class.name,
            )
        )

    return result
