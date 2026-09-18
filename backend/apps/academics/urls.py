from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import GenerateLessonsView, LessonViewSet, SubjectViewSet, TimetableSlotViewSet

router = DefaultRouter()
router.register("subjects", SubjectViewSet, basename="subject")
router.register("lessons", LessonViewSet, basename="lesson")
router.register("timetable-slots", TimetableSlotViewSet, basename="timetableslot")

urlpatterns = [
    path("timetable/generate/", GenerateLessonsView.as_view(), name="timetable-generate"),
    *router.urls,
]
