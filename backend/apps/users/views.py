from dataclasses import asdict
from typing import ClassVar

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveAPIView
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsDirector, IsDirectorOrReadOnly

from . import services
from .models import StudentProfile, TeacherProfile
from .serializers import (
    ChangePasswordSerializer,
    MeSerializer,
    StudentSerializer,
    TeacherSerializer,
    UserSerializer,
)

User = get_user_model()


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """Director-only endpoint listing every account in the system."""

    serializer_class = UserSerializer
    queryset = User.objects.all()
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]
    filterset_fields = ("role", "is_active", "is_staff")
    search_fields = ("email", "username", "first_name", "last_name")
    ordering_fields = ("email", "username", "date_joined")


class MeView(RetrieveAPIView):
    """Returns the currently authenticated user, including their role."""

    serializer_class = MeSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class TeacherViewSet(viewsets.ModelViewSet):
    """Director: full CRUD (account + profile in one call). Everyone else: read-only list."""

    serializer_class = TeacherSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirectorOrReadOnly]
    http_method_names: ClassVar[list[str]] = ["get", "post", "patch", "put", "head", "options"]
    queryset = TeacherProfile.objects.select_related("user").order_by("user__first_name")
    search_fields = ("user__email", "user__first_name", "user__last_name")


class StudentViewSet(viewsets.ModelViewSet):
    """Director: full CRUD. Teacher: students in classes they're involved with. Student: only themselves."""

    serializer_class = StudentSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirectorOrReadOnly]
    http_method_names: ClassVar[list[str]] = ["get", "post", "patch", "put", "head", "options"]
    search_fields = ("user__email", "user__first_name", "user__last_name")
    filterset_fields = ("school_class",)

    def get_queryset(self):
        user = self.request.user
        queryset = StudentProfile.objects.select_related("user", "school_class").order_by(
            "user__first_name"
        )

        if user.is_director:
            return queryset
        if user.is_teacher:
            profile = user.teacher_profile
            return queryset.filter(
                Q(school_class__class_teacher=profile) | Q(school_class__lessons__teacher=profile)
            ).distinct()
        if user.is_student:
            return queryset.filter(pk=user.student_profile.pk)
        return queryset.none()


class BulkImportStudentsView(APIView):
    """Director-only: upload a CSV/XLSX of students and get back the created
    accounts' login credentials (temporary passwords are shown here exactly
    once — they're never stored in plaintext or returned again afterwards).
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]
    parser_classes: ClassVar[list[type]] = [MultiPartParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if file_obj is None:
            raise ValidationError({"file": "This field is required."})

        result = services.bulk_import_students(file_obj)

        return Response(
            {
                "created_count": len(result.created),
                "error_count": len(result.errors),
                "created": [asdict(item) for item in result.created],
                "errors": result.errors,
            }
        )


class ChangePasswordView(APIView):
    """Lets any authenticated user set a new password — used to satisfy
    `must_change_password` after a temporary/bulk-imported password.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        return Response({"detail": "Password updated."})
