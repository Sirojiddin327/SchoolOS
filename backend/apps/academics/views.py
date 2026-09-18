from typing import ClassVar

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsDirector, IsDirectorOrReadOnly

from . import services
from .filters import LessonFilter
from .models import Lesson, Subject, TimetableSlot
from .serializers import (
    GenerateLessonsSerializer,
    LessonSerializer,
    SubjectSerializer,
    TimetableSlotSerializer,
)


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


class TimetableSlotViewSet(viewsets.ModelViewSet):
    """The recurring weekly template. Director: full CRUD. Others: read-only, same scope as Lesson."""

    serializer_class = TimetableSlotSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirectorOrReadOnly]
    filterset_fields = ("school_class", "subject", "teacher", "day_of_week")

    def get_queryset(self):
        user = self.request.user
        queryset = TimetableSlot.objects.select_related("subject", "school_class", "teacher__user")

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


class GenerateLessonsView(APIView):
    """Director-only: turn the timetable template into real, dated Lesson rows for one week."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]

    def post(self, request):
        serializer = GenerateLessonsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lessons = services.generate_lessons_for_week(serializer.validated_data["week_start"])
        return Response(LessonSerializer(lessons, many=True).data)
