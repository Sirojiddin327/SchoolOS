from rest_framework.routers import DefaultRouter

from .views import LessonViewSet, SubjectViewSet

router = DefaultRouter()
router.register("subjects", SubjectViewSet, basename="subject")
router.register("lessons", LessonViewSet, basename="lesson")

urlpatterns = router.urls
