from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BulkImportStudentsView, StudentViewSet, TeacherViewSet, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("teachers", TeacherViewSet, basename="teacher")
router.register("students", StudentViewSet, basename="student")

urlpatterns = [
    path("students/bulk-import/", BulkImportStudentsView.as_view(), name="students-bulk-import"),
    *router.urls,
]
