from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AchievementListView,
    AchievementManageViewSet,
    ClassLeaderboardView,
    MyRankView,
    MyStreakView,
    StudentLeaderboardView,
    XPHistoryView,
)

router = DefaultRouter()
router.register("achievements/manage", AchievementManageViewSet, basename="achievement-manage")

urlpatterns = [
    path("xp/history/", XPHistoryView.as_view(), name="xp-history"),
    path("leaderboard/students/", StudentLeaderboardView.as_view(), name="leaderboard-students"),
    path("leaderboard/classes/", ClassLeaderboardView.as_view(), name="leaderboard-classes"),
    path("leaderboard/me/", MyRankView.as_view(), name="leaderboard-me"),
    path("achievements/", AchievementListView.as_view(), name="achievements"),
    path("streaks/me/", MyStreakView.as_view(), name="my-streak"),
    *router.urls,
]
