from django.urls import path

from .views import (
    ClassReportAISummaryView,
    ClassReportView,
    DirectorDashboardView,
    SchoolReportAISummaryView,
    SchoolReportView,
    StudentDashboardView,
    TeacherDashboardView,
)

urlpatterns = [
    path("dashboard/director/", DirectorDashboardView.as_view(), name="dashboard-director"),
    path("dashboard/teacher/", TeacherDashboardView.as_view(), name="dashboard-teacher"),
    path("dashboard/student/", StudentDashboardView.as_view(), name="dashboard-student"),
    path("reports/classes/<int:pk>/", ClassReportView.as_view(), name="class-report"),
    path("reports/classes/<int:pk>/ai-summary/", ClassReportAISummaryView.as_view(), name="class-report-ai"),
    path("reports/school/", SchoolReportView.as_view(), name="school-report"),
    path("reports/school/ai-summary/", SchoolReportAISummaryView.as_view(), name="school-report-ai"),
]
