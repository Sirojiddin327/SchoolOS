from rest_framework import serializers

from .models import Achievement, Streak, XPTransaction


class XPTransactionSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    related_title = serializers.SerializerMethodField()

    class Meta:
        model = XPTransaction
        fields = (
            "id",
            "student",
            "student_name",
            "amount",
            "source",
            "reason",
            "related_title",
            "created_at",
        )
        read_only_fields = fields

    def get_student_name(self, obj) -> str:
        return str(obj.student)

    def get_related_title(self, obj) -> str | None:
        return str(obj.related_object) if obj.related_object else None


class StudentLeaderboardSerializer(serializers.Serializer):
    """Takes `{"rank": int, "student": StudentProfile}` — deliberately exposes
    only rank/name/avatar/class/xp, never email/phone (spec: don't leak private
    info).
    """

    rank = serializers.IntegerField()
    name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    school_class_name = serializers.SerializerMethodField()
    total_xp = serializers.SerializerMethodField()

    def get_name(self, obj) -> str:
        student = obj["student"]
        return student.user.get_full_name() or student.user.username

    def get_avatar_url(self, obj) -> str | None:
        avatar = obj["student"].user.avatar
        if not avatar:
            return None
        request = self.context.get("request")
        url = avatar.url
        return request.build_absolute_uri(url) if request else url

    def get_school_class_name(self, obj) -> str | None:
        school_class = obj["student"].school_class
        return school_class.name if school_class else None

    def get_total_xp(self, obj) -> int:
        return obj["student"].total_xp


class ClassLeaderboardSerializer(serializers.Serializer):
    """Takes `{"rank": int, "school_class": SchoolClass}`."""

    rank = serializers.IntegerField()
    name = serializers.SerializerMethodField()
    total_xp = serializers.SerializerMethodField()

    def get_name(self, obj) -> str:
        return obj["school_class"].name

    def get_total_xp(self, obj) -> int:
        return obj["school_class"].total_xp


class AchievementSerializer(serializers.ModelSerializer):
    unlocked = serializers.SerializerMethodField()
    unlocked_at = serializers.SerializerMethodField()

    class Meta:
        model = Achievement
        fields = (
            "id",
            "name",
            "description",
            "icon",
            "condition_type",
            "condition_value",
            "xp_reward",
            "unlocked",
            "unlocked_at",
        )

    def get_unlocked(self, obj) -> bool:
        return obj.id in self.context.get("unlocked", {})

    def get_unlocked_at(self, obj):
        return self.context.get("unlocked", {}).get(obj.id)


class StreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = Streak
        fields = ("current_streak", "longest_streak", "last_activity_date")


class AchievementManageSerializer(serializers.ModelSerializer):
    """Director-only CRUD over the achievement catalog — plain fields, no
    per-caller `unlocked` status (that's what `AchievementSerializer` is for).
    """

    class Meta:
        model = Achievement
        fields = (
            "id",
            "name",
            "description",
            "icon",
            "condition_type",
            "condition_value",
            "xp_reward",
            "is_active",
        )
