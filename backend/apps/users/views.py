from typing import ClassVar

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated

from apps.common.permissions import IsDirector, IsDirectorOrReadOnly

from .models import StudentProfile, TeacherProfile
from .serializers import MeSerializer, StudentSerializer, TeacherSerializer, UserSerializer

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
