from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ActivitySubmissionViewSet,
    ActivityViewSet,
    MyActivitySubmissionsView,
    MyAttemptsView,
    OptionViewSet,
    QuestionViewSet,
    TestViewSet,
)

router = DefaultRouter()
router.register("tests", TestViewSet, basename="test")
router.register("questions", QuestionViewSet, basename="question")
router.register("options", OptionViewSet, basename="option")
router.register("activities", ActivityViewSet, basename="activity")
router.register("activity-submissions", ActivitySubmissionViewSet, basename="activitysubmission")

urlpatterns = [
    path("my-attempts/", MyAttemptsView.as_view(), name="my-attempts"),
    path("my-activity-submissions/", MyActivitySubmissionsView.as_view(), name="my-activity-submissions"),
    *router.urls,
]
