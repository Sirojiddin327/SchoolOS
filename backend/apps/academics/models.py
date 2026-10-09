from typing import ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import OrganizationScopedMixin, TimeStampedModel


class Subject(TimeStampedModel):
    name = models.CharField(_("name"), max_length=100, unique=True)

    class Meta:
        verbose_name = _("subject")
        verbose_name_plural = _("subjects")
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class Lesson(OrganizationScopedMixin, TimeStampedModel):
    organization_source = "school_class.organization"

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="lessons",
        on_delete=models.CASCADE,
    )
    subject = models.ForeignKey(
        Subject,
        verbose_name=_("subject"),
        related_name="lessons",
        on_delete=models.PROTECT,
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass",
        verbose_name=_("class"),
        related_name="lessons",
        on_delete=models.CASCADE,
    )
    teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("teacher"),
        related_name="lessons",
        on_delete=models.PROTECT,
    )
    secondary_teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("secondary teacher"),
        related_name="secondary_lessons",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    date = models.DateField(_("date"))
    start_time = models.TimeField(_("start time"))
    end_time = models.TimeField(_("end time"))
    room = models.CharField(_("room"), max_length=50, blank=True)
    topic = models.CharField(_("topic"), max_length=255, blank=True)

    class Meta:
        verbose_name = _("lesson")
        verbose_name_plural = _("lessons")
        ordering = ("date", "start_time")
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["school_class", "date", "start_time"],
                name="unique_class_timeslot",
            ),
            models.UniqueConstraint(
                fields=["teacher", "date", "start_time"],
                name="unique_teacher_timeslot",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.subject} — {self.school_class} ({self.date})"

    def clean(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": _("End time must be after start time.")})


class TimetableSlot(OrganizationScopedMixin, TimeStampedModel):
    """A recurring weekly schedule entry — 'every Monday, period 2, this class has Math'.

    Concrete dated `Lesson` rows are generated from these (see services.generate_lessons_for_week),
    so attendance keeps working against real Lesson instances, not the template.
    """

    organization_source = "school_class.organization"

    class DayOfWeek(models.IntegerChoices):
        MONDAY = 1, _("Monday")
        TUESDAY = 2, _("Tuesday")
        WEDNESDAY = 3, _("Wednesday")
        THURSDAY = 4, _("Thursday")
        FRIDAY = 5, _("Friday")
        SATURDAY = 6, _("Saturday")

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="timetable_slots",
        on_delete=models.CASCADE,
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass",
        verbose_name=_("class"),
        related_name="timetable_slots",
        on_delete=models.CASCADE,
    )
    subject = models.ForeignKey(
        Subject,
        verbose_name=_("subject"),
        related_name="timetable_slots",
        on_delete=models.PROTECT,
    )
    teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("teacher"),
        related_name="timetable_slots",
        on_delete=models.PROTECT,
    )
    secondary_teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("secondary teacher"),
        related_name="secondary_timetable_slots",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    day_of_week = models.PositiveSmallIntegerField(_("day of week"), choices=DayOfWeek.choices)
    period_number = models.PositiveSmallIntegerField(_("period number"))
    room = models.CharField(_("room"), max_length=50, blank=True)

    class Meta:
        verbose_name = _("timetable slot")
        verbose_name_plural = _("timetable slots")
        ordering = ("day_of_week", "period_number")
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["school_class", "day_of_week", "period_number"],
                name="unique_class_slot",
            ),
            models.UniqueConstraint(
                fields=["teacher", "day_of_week", "period_number"],
                name="unique_teacher_slot",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.school_class} — {self.get_day_of_week_display()} #{self.period_number}: {self.subject}"

    def teacher_label(self) -> str:
        if self.secondary_teacher_id:
            return f"{self.teacher} / {self.secondary_teacher}"
        return str(self.teacher)


class DailyScheduleDigest(OrganizationScopedMixin, TimeStampedModel):
    """Marks that `user` has already been sent their whole day of lessons.

    The send-once guard for `tasks.send_daily_schedules`, which runs once a day
    at 07:00 — but "once" has to survive Celery Beat retrying a run, two beat
    instances overlapping, a worker restart mid-run, and somebody firing the task
    by hand while debugging. Keyed on (user, date) rather than the lesson like the
    task it replaces, because the unit that must not repeat is a user's *day*,
    not any single lesson.
    """

    organization_source = "user.active_organization"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("user"),
        related_name="daily_schedule_digests",
        on_delete=models.CASCADE,
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="daily_schedule_digests",
        on_delete=models.CASCADE,
    )
    date = models.DateField(_("date"))
    sent_at = models.DateTimeField(_("sent at"), auto_now_add=True)

    class Meta:
        verbose_name = _("daily schedule digest")
        verbose_name_plural = _("daily schedule digests")
        ordering = ("-date",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["user", "organization", "date"],
                name="unique_daily_schedule_per_user_org",
            )
        ]

    def __str__(self) -> str:
        return f"Daily schedule sent to {self.user} at {self.organization} for {self.date}"
