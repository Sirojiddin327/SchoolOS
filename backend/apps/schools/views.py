from typing import ClassVar

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from apps.common.permissions import IsDirectorOrReadOnly

from .models import SchoolClass
from .serializers import SchoolClassSerializer, StudentRosterSerializer


class SchoolClassViewSet(viewsets.ModelViewSet):
    """Director: full CRUD. Teacher: classes they lead or teach in. Student: their own class."""

    serializer_class = SchoolClassSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirectorOrReadOnly]
    search_fields = ("name",)
    ordering_fields = ("name",)

    def get_queryset(self):
        user = self.request.user
        queryset = SchoolClass.objects.select_related("class_teacher__user")

        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(
                Q(class_teacher=user.teacher_profile) | Q(lessons__teacher=user.teacher_profile)
            ).distinct()
        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            if student_profile and student_profile.school_class_id:
                return queryset.filter(pk=student_profile.school_class_id)
        return queryset.none()

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        school_class = self.get_object()
        roster = school_class.students.select_related("user").order_by("user__first_name")
        serializer = StudentRosterSerializer(roster, many=True)
        return Response(serializer.data)
