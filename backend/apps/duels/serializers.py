from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import Subject
from apps.users.models import StudentProfile

from . import rules, services
from .models import Duel, DuelRating

ARCHETYPES = ("strategist", "speedster", "scholar", "explorer", "challenger")


def archetype_for(student) -> str:
    """A student's duel character — stable per student, so both sides of a
    match see the same avatar without anything to store or configure."""
    return ARCHETYPES[student.pk % len(ARCHETYPES)]


def tier_for_rating(rating: int) -> str:
    if rating >= 1500:
        return "Afsona"
    if rating >= 1300:
        return "Bilimdon"
    if rating >= 1100:
        return "Tajribali"
    return "Yangi boshlovchi"


def _avatar_url(student, request) -> str | None:
    if not student.user.avatar:
        return None
    url = student.user.avatar.url
    return request.build_absolute_uri(url) if request else url


def _player(student, request) -> dict:
    return {
        "id": student.pk,
        "name": services.display_name(student),
        "archetype": archetype_for(student),
        "avatar_url": _avatar_url(student, request),
        "is_ai": False,
    }


def _ai_player(level: str) -> dict:
    profile = rules.AI_OPPONENTS[level]
    return {"id": None, "name": profile["name"], "archetype": f"ai-{level.lower()}", "avatar_url": None, "is_ai": True}


class DuelSerializer(serializers.ModelSerializer):
    """Everything from the viewer's side — "me" vs "opponent" — never raw
    challenger/opponent, and never the opponent's chosen options."""

    subject_name = serializers.CharField(source="subject.name", read_only=True, default="")
    difficulty_display = serializers.CharField(source="get_difficulty_display", read_only=True)
    my_role = serializers.SerializerMethodField()
    me = serializers.SerializerMethodField()
    opponent_player = serializers.SerializerMethodField()
    awaiting_my_response = serializers.SerializerMethodField()
    i_am_ready = serializers.SerializerMethodField()
    opponent_ready = serializers.SerializerMethodField()
    seconds_per_question = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()
    battle = serializers.SerializerMethodField()
    outcome = serializers.SerializerMethodField()
    my_xp = serializers.SerializerMethodField()

    class Meta:
        model = Duel
        fields = (
            "id",
            "mode",
            "ai_level",
            "status",
            "subject",
            "subject_name",
            "difficulty",
            "difficulty_display",
            "question_count",
            "seconds_per_question",
            "my_role",
            "me",
            "opponent_player",
            "awaiting_my_response",
            "i_am_ready",
            "opponent_ready",
            "match_starts_at",
            "server_now",
            "battle",
            "outcome",
            "my_xp",
            "created_at",
            "completed_at",
        )
        read_only_fields = fields

    def _profile(self):
        request = self.context.get("request")
        return getattr(getattr(request, "user", None), "student_profile", None)

    def _role(self, obj) -> str | None:
        return obj.role_of(self._profile())

    def _other(self, role: str | None) -> str:
        return "opponent" if role == "challenger" else "challenger"

    def get_my_role(self, obj) -> str | None:
        return self._role(obj)

    def get_me(self, obj) -> dict:
        role = self._role(obj)
        student = obj.challenger if role != "opponent" else obj.opponent
        return _player(student, self.context.get("request"))

    def get_opponent_player(self, obj) -> dict:
        if obj.mode == Duel.Mode.AI:
            return _ai_player(obj.ai_level)
        role = self._role(obj)
        student = obj.opponent if role == "challenger" else obj.challenger
        return _player(student, self.context.get("request"))

    def get_awaiting_my_response(self, obj) -> bool:
        return obj.status == Duel.Status.PENDING and self._role(obj) == "opponent"

    def get_i_am_ready(self, obj) -> bool:
        return getattr(obj, f"{self._role(obj) or 'challenger'}_ready_at") is not None

    def get_opponent_ready(self, obj) -> bool:
        if obj.mode == Duel.Mode.AI:
            return True
        return getattr(obj, f"{self._other(self._role(obj))}_ready_at") is not None

    def get_seconds_per_question(self, obj) -> int:
        return rules.SECONDS_PER_QUESTION.get(obj.difficulty, 20)

    def get_server_now(self, obj) -> str:
        return timezone.now().isoformat()

    def get_battle(self, obj) -> dict | None:
        """Both sides' HP / score / combo / progress — safe to show live: it says
        how the opponent is doing, never which option they picked."""
        if not obj.questions:
            return None
        sides = services.battle(obj)
        role = self._role(obj) or "challenger"
        hidden = {"last"}
        me = sides[role]
        opponent = {k: v for k, v in sides[self._other(role)].items() if k not in hidden}
        return {"me": me, "opponent": opponent, "hp_max": rules.HP_MAX}

    def get_outcome(self, obj) -> str | None:
        if obj.status != Duel.Status.COMPLETED or not obj.result:
            return None
        return services._outcome_for(obj, self._role(obj) or "challenger")

    def get_my_xp(self, obj) -> int | None:
        profile = self._profile()
        if obj.status != Duel.Status.COMPLETED or profile is None:
            return None
        return services.xp_for_duel(obj, profile)


class DuelCreateSerializer(serializers.Serializer):
    """Either `opponent` (a classmate) or `ai_level`."""

    opponent = serializers.PrimaryKeyRelatedField(queryset=StudentProfile.objects.all(), required=False)
    ai_level = serializers.ChoiceField(choices=Duel.AILevel.choices, required=False)
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    difficulty = serializers.ChoiceField(choices=Duel.Difficulty.choices, default=Duel.Difficulty.MEDIUM)
    question_count = serializers.ChoiceField(choices=rules.QUESTION_COUNTS, default=10)

    def validate(self, attrs):
        if bool(attrs.get("opponent")) == bool(attrs.get("ai_level")):
            raise serializers.ValidationError("Sinfdosh yoki AI raqibdan birini tanlang.")
        return attrs

    def create(self, validated_data):
        try:
            return services.create_duel(
                challenger=self.context["request"].user.student_profile,
                opponent=validated_data.get("opponent"),
                ai_level=validated_data.get("ai_level", ""),
                subject=validated_data["subject"],
                difficulty=validated_data["difficulty"],
                question_count=validated_data["question_count"],
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class DuelAnswerSerializer(serializers.Serializer):
    question_index = serializers.IntegerField(min_value=0)
    # -1 = the timer ran out.
    selected_index = serializers.IntegerField(min_value=-1)


class ClassmateSerializer(serializers.ModelSerializer):
    """A classmate as a possible opponent — name, avatar, duel record. No email
    or other contact details."""

    name = serializers.SerializerMethodField()
    archetype = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    wins = serializers.SerializerMethodField()
    losses = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    has_open_duel = serializers.SerializerMethodField()

    class Meta:
        model = StudentProfile
        fields = ("id", "name", "archetype", "avatar_url", "wins", "losses", "rating", "has_open_duel")

    def _rating(self, obj):
        """The viewer's-organization rating, prefetched by the viewset as
        `scoped_duel_ratings` (see `DuelViewSet.opponents`)."""
        scoped = getattr(obj, "scoped_duel_ratings", None)
        return scoped[0] if scoped else None

    def get_name(self, obj) -> str:
        return services.display_name(obj)

    def get_archetype(self, obj) -> str:
        return archetype_for(obj)

    def get_avatar_url(self, obj) -> str | None:
        return _avatar_url(obj, self.context.get("request"))

    def get_wins(self, obj) -> int:
        rating = self._rating(obj)
        return rating.wins if rating else 0

    def get_losses(self, obj) -> int:
        rating = self._rating(obj)
        return rating.losses if rating else 0

    def get_rating(self, obj) -> int:
        rating = self._rating(obj)
        return rating.rating if rating else DuelRating.DEFAULT_RATING

    def get_has_open_duel(self, obj) -> bool:
        return obj.pk in self.context.get("open_with", set())


class DuelRatingSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source="student.pk")
    student_name = serializers.SerializerMethodField()
    archetype = serializers.SerializerMethodField()
    tier = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    win_rate = serializers.SerializerMethodField()

    class Meta:
        model = DuelRating
        fields = ("student_id", "student_name", "archetype", "rating", "tier", "wins", "losses", "draws", "total", "win_rate")

    def get_student_name(self, obj) -> str:
        return services.display_name(obj.student)

    def get_archetype(self, obj) -> str:
        return archetype_for(obj.student)

    def get_tier(self, obj) -> str:
        return tier_for_rating(obj.rating)

    def get_total(self, obj) -> int:
        return obj.wins + obj.losses + obj.draws

    def get_win_rate(self, obj) -> int:
        total = obj.wins + obj.losses + obj.draws
        return round(obj.wins / total * 100) if total else 0
