from django.urls import path

from .views import (
    AchievementListView,
    ClassLeaderboardView,
    MyStreakView,
    StudentLeaderboardView,
    XPHistoryView,
)

urlpatterns = [
    path("xp/history/", XPHistoryView.as_view(), name="xp-history"),
    path("leaderboard/students/", StudentLeaderboardView.as_view(), name="leaderboard-students"),
    path("leaderboard/classes/", ClassLeaderboardView.as_view(), name="leaderboard-classes"),
    path("achievements/", AchievementListView.as_view(), name="achievements"),
    path("streaks/me/", MyStreakView.as_view(), name="my-streak"),
]
