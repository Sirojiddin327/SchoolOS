from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Organization, OrganizationMembership

User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "type", "timezone", "is_active")
        read_only_fields = ("id", "slug", "is_active")


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_type = serializers.CharField(source="organization.type", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationMembership
        fields = (
            "id",
            "organization",
            "organization_name",
            "organization_type",
            "user",
            "user_email",
            "user_name",
            "role",
            "status",
            "joined_at",
        )
        read_only_fields = ("id", "user", "user_email", "user_name", "organization_name")

    def get_user_name(self, obj) -> str:
        return obj.user.get_full_name() or obj.user.username


class SwitchOrganizationSerializer(serializers.Serializer):
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
        help_text="ID of the organization to make active.",
    )


class CreateOrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "type", "timezone")
        read_only_fields = ("id",)

    def validate_slug(self, value):
        if Organization.objects.filter(slug=value).exists():
            raise serializers.ValidationError("Bu slug allaqach band.")
        return value


class MembershipCreateSerializer(serializers.Serializer):
    """Adds an existing `User` to an organization.

    Takes a user *ID*, not an email: accounts are global and already exist, and
    letting a director invent a new login from this form would quietly create
    accounts with no profile attached.
    """

    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True)
    )
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    role = serializers.ChoiceField(choices=OrganizationMembership.Role.choices)
    status = serializers.ChoiceField(
        choices=OrganizationMembership.Status.choices,
        default=OrganizationMembership.Status.ACTIVE,
    )

    def validate(self, attrs):
        organization = attrs["organization"]
        user = attrs["user"]
        if organization.memberships.filter(user=user).exists():
            raise serializers.ValidationError(
                {"user": "Bu foydalanuvchi tashkilotga allaqach a'zo."}
            )
        if user.active_organization_id is None:
            user.active_organization = organization
            user.save(update_fields=["active_organization"])
        return attrs

    def create(self, validated_data):
        return OrganizationMembership.objects.create(**validated_data)
