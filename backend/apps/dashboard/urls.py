from django.urls import path

from .views import DirectorDashboardView, StudentDashboardView, TeacherDashboardView

urlpatterns = [
    path("dashboard/director/", DirectorDashboardView.as_view(), name="dashboard-director"),
    path("dashboard/teacher/", TeacherDashboardView.as_view(), name="dashboard-teacher"),
    path("dashboard/student/", StudentDashboardView.as_view(), name="dashboard-student"),
]
