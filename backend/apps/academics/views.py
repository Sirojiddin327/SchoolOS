from typing import ClassVar

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import BasePermission

from apps.common.permissions import IsDirectorOrReadOnly

from .filters import LessonFilter
from .models import Lesson, Subject
from .serializers import LessonSerializer, SubjectSerializer


class SubjectViewSet(viewsets.ModelViewSet):
    serializer_class = SubjectSerializer
    queryset = Subject.objects.all()
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirectorOrReadOnly]
    search_fields = ("name",)
    ordering_fields = ("name",)


class LessonViewSet(viewsets.ModelViewSet):
    """Director: full CRUD. Teacher: their own or their led-class's lessons. Student: their class's lessons."""

    serializer_class = LessonSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirectorOrReadOnly]
    filterset_class = LessonFilter
    ordering_fields = ("date", "start_time")

    def get_queryset(self):
        user = self.request.user
        queryset = Lesson.objects.select_related("subject", "school_class", "teacher__user")

        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(
                Q(teacher=user.teacher_profile)
                | Q(school_class__class_teacher=user.teacher_profile)
            ).distinct()
        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            if student_profile and student_profile.school_class_id:
                return queryset.filter(school_class_id=student_profile.school_class_id)
        return queryset.none()
