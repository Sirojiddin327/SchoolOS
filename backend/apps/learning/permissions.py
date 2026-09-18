from rest_framework import permissions


class IsTestOwnerOrDirector(permissions.BasePermission):
    """Director/teacher/student may all read (`get_queryset` does the real
    scoping — students only ever see published tests for their own class, so
    there's nothing extra to check here for reads). Only the director, or the
    teacher who owns the test, may create/write/delete.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return user.is_director or user.is_teacher or user.is_student
        return user.is_director or user.is_teacher

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_director:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        profile = getattr(user, "teacher_profile", None)
        return bool(user.is_teacher and profile and obj.teacher_id == profile.pk)


class IsQuestionOwnerOrDirector(permissions.BasePermission):
    """Same ownership rule as `IsTestOwnerOrDirector`, one hop through `test`."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_director or user.is_teacher))

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_director:
            return True
        profile = getattr(user, "teacher_profile", None)
        return bool(user.is_teacher and profile and obj.test.teacher_id == profile.pk)


class IsOptionOwnerOrDirector(permissions.BasePermission):
    """Same ownership rule, two hops through `question.test`."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_director or user.is_teacher))

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_director:
            return True
        profile = getattr(user, "teacher_profile", None)
        return bool(user.is_teacher and profile and obj.question.test.teacher_id == profile.pk)


class IsActivityOwnerOrDirector(permissions.BasePermission):
    """Same shape as `IsTestOwnerOrDirector`, for `Activity`."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return user.is_director or user.is_teacher or user.is_student
        return user.is_director or user.is_teacher

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_director:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        profile = getattr(user, "teacher_profile", None)
        return bool(user.is_teacher and profile and obj.teacher_id == profile.pk)


class IsSubmissionOwnerOrDirector(permissions.BasePermission):
    """Director always; the owning teacher (via `activity.teacher`) for grading;
    the submitting student may read their own submission.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_director:
            return True
        profile = getattr(user, "teacher_profile", None)
        if user.is_teacher and profile and obj.activity.teacher_id == profile.pk:
            return True
        student_profile = getattr(user, "student_profile", None)
        return bool(
            request.method in permissions.SAFE_METHODS
            and student_profile
            and obj.student_id == student_profile.pk
        )
