from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MyAttemptsView, OptionViewSet, QuestionViewSet, TestViewSet

router = DefaultRouter()
router.register("tests", TestViewSet, basename="test")
router.register("questions", QuestionViewSet, basename="question")
router.register("options", OptionViewSet, basename="option")

urlpatterns = [
    path("my-attempts/", MyAttemptsView.as_view(), name="my-attempts"),
    *router.urls,
]
