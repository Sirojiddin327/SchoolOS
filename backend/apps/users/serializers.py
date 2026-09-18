from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import StudentProfile, TeacherProfile

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "role",
            "is_staff",
            "is_active",
            "date_joined",
        )
        read_only_fields = ("id", "role", "is_staff", "is_active", "date_joined")


class MeSerializer(serializers.ModelSerializer):
    total_xp = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "role",
            "must_change_password",
            "total_xp",
            "avatar_url",
        )
        read_only_fields = fields

    def get_total_xp(self, obj) -> int | None:
        profile = getattr(obj, "student_profile", None)
        return profile.total_xp if profile else None

    def get_avatar_url(self, obj) -> str | None:
        if not obj.avatar:
            return None
        request = self.context.get("request")
        url = obj.avatar.url
        return request.build_absolute_uri(url) if request else url


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024


class AvatarSerializer(serializers.ModelSerializer):
    avatar = serializers.ImageField(required=True)

    class Meta:
        model = User
        fields = ("avatar",)

    def validate_avatar(self, value):
        if value.size > MAX_AVATAR_SIZE_BYTES:
            raise serializers.ValidationError("Image must be 5MB or smaller.")
        return value


class TeacherSerializer(serializers.ModelSerializer):
    """Director-managed CRUD over a teacher's account + profile in one call."""

    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name", required=False, allow_blank=True)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_blank=True)
    is_active = serializers.BooleanField(source="user.is_active", required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = TeacherProfile
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "phone_number",
            "bio",
            "password",
        )

    def validate_email(self, value):
        queryset = User.objects.filter(email__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.user_id)
        if queryset.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        user_data = validated_data.pop("user")
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Required when creating a teacher."})
        user = User.objects.create_user(
            username=user_data["email"],
            email=user_data["email"],
            password=password,
            role=User.Role.TEACHER,
            first_name=user_data.get("first_name", ""),
            last_name=user_data.get("last_name", ""),
        )
        return TeacherProfile.objects.create(user=user, **validated_data)

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", None)
        for attr, value in user_data.items():
            setattr(instance.user, attr, value)
        if password:
            instance.user.set_password(password)
        instance.user.save()
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class StudentSerializer(serializers.ModelSerializer):
    """Director-managed CRUD over a student's account + profile in one call."""

    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name", required=False, allow_blank=True)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_blank=True)
    is_active = serializers.BooleanField(source="user.is_active", required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)

    class Meta:
        model = StudentProfile
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "school_class",
            "school_class_name",
            "birth_date",
            "phone_number",
            "parent_phone_number",
            "password",
            "total_xp",
        )
        read_only_fields = ("total_xp",)

    def validate_email(self, value):
        queryset = User.objects.filter(email__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.user_id)
        if queryset.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        user_data = validated_data.pop("user")
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Required when creating a student."})
        user = User.objects.create_user(
            username=user_data["email"],
            email=user_data["email"],
            password=password,
            role=User.Role.STUDENT,
            first_name=user_data.get("first_name", ""),
            last_name=user_data.get("last_name", ""),
        )
        return StudentProfile.objects.create(user=user, **validated_data)

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", None)
        for attr, value in user_data.items():
            setattr(instance.user, attr, value)
        if password:
            instance.user.set_password(password)
        instance.user.save()
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
