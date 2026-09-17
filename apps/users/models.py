from typing import ClassVar
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _
from datetime import datetime, timedelta

class User(AbstractUser):
    email = models.EmailField(
        _("email address"),
        unique=True,
        help_text=_("Required. A unique email address."),
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["username"]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering: ClassVar[list[str]] = ["-date_joined"]

    def __str__(self) -> str:
        return f"{self.get_full_name() or self.username} <{self.email}>"




class SchoolClass(models.Model):
    name = models.CharField(max_length=10, unique=True, verbose_name="Sinf nomi")  # masalan "9-V"

    class Meta:
        verbose_name = "Sinf"
        verbose_name_plural = "Sinflar"

    def __str__(self):
        return self.name


class Student(models.Model):
    full_name = models.CharField(max_length=255, verbose_name="To'liq ismi")
    grade = models.ForeignKey(SchoolClass, on_delete=models.SET_NULL, null=True, related_name="students", verbose_name="Sinfi")
    age = models.PositiveIntegerField(verbose_name="Yoshi")
    xp = models.PositiveIntegerField(default=0, verbose_name="XP (tajriba ballari)")

    class Meta:
        verbose_name = "Student"
        verbose_name_plural = "Students"

    def __str__(self):
        return f"{self.full_name} ({self.grade}) - XP: {self.xp}"

    def add_xp(self, points: int):
        self.xp += points
        self.save()


class Teacher(models.Model):
    full_name = models.CharField(max_length=255, verbose_name="To'liq ismi")
    age = models.PositiveIntegerField(verbose_name="Yoshi")
    subject = models.CharField(max_length=100, verbose_name="Qaysi fandan dars berishi")
    classes = models.ManyToManyField(SchoolClass, related_name="teachers", verbose_name="Dars beradigan sinflari")

    class Meta:
        verbose_name = "Teacher"
        verbose_name_plural = "Teachers"

    def __str__(self):
        class_list = ", ".join(c.name for c in self.classes.all())
        return f"{self.full_name} - {self.subject} ({class_list})"


class Director(models.Model):
    full_name = models.CharField(max_length=255, verbose_name="To'liq ismi")
    age = models.PositiveIntegerField(verbose_name="Yoshi")
    school_name = models.CharField(max_length=255, verbose_name="Maktab nomi")
    phone_number = models.CharField(max_length=20, blank=True, verbose_name="Telefon raqami")
    experience_years = models.PositiveIntegerField(default=0, verbose_name="Ish staji (yil)")
    hired_date = models.DateField(verbose_name="Ishga qabul qilingan sana")
    photo = models.ImageField(upload_to="directors/", blank=True, null=True, verbose_name="Rasmi")

    class Meta:
        verbose_name = "Direktor"
        verbose_name_plural = "Direktorlar"

    def __str__(self):
        return f"{self.full_name} - {self.school_name}"




class Lesson(models.Model):
    DAYS_OF_WEEK = [
        ('mon', 'Dushanba'),
        ('tue', 'Seshanba'),
        ('wed', 'Chorshanba'),
        ('thu', 'Payshanba'),
        ('fri', 'Juma'),
        ('sat', 'Shanba'),
    ]

    LESSON_NUMBERS = [(i, f"{i}-dars") for i in range(1, 9)]

    LESSON_DURATION = 45       # har bir dars davomiyligi (daqiqa)
    SHORT_BREAK = 5            # oddiy tanaffus (daqiqa)
    LONG_BREAK = 20            # 4-darsdan keyingi katta tanaffus (daqiqa)
    LONG_BREAK_AFTER = 4       # katta tanaffus qaysi darsdan keyin bo'ladi

    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name="lessons", verbose_name="Sinfi")
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="lessons", verbose_name="O'qituvchisi")
    subject = models.CharField(max_length=100, verbose_name="Fan nomi")
    day_of_week = models.CharField(max_length=3, choices=DAYS_OF_WEEK, verbose_name="Hafta kuni")
    lesson_number = models.PositiveSmallIntegerField(choices=LESSON_NUMBERS, verbose_name="Necha-darsligi")
    start_time = models.TimeField(verbose_name="Boshlanish vaqti", blank=True, editable=False)
    end_time = models.TimeField(verbose_name="Tugash vaqti", blank=True, editable=False)
    room_number = models.CharField(max_length=20, blank=True, verbose_name="Xona raqami")

    # Faqat 1-darsni yaratishda kiritiladigan yordamchi maydon (bazaga saqlanmaydi)
    day_start_time = models.TimeField(verbose_name="Kunning boshlanish vaqti (faqat hisoblash uchun)", null=True, blank=True)

    class Meta:
        verbose_name = "Dars"
        verbose_name_plural = "Darslar (Raspisaniya)"
        ordering = ["day_of_week", "lesson_number"]
        unique_together = ("school_class", "day_of_week", "lesson_number")

    @classmethod
    def calculate_start_time(cls, day_start_time, lesson_number):
        """
        Kunning boshlanish vaqti va necha-darsligiga qarab,
        shu darsning boshlanish vaqtini hisoblaydi (tanaffuslar bilan).
        """
        current = datetime.combine(datetime.today(), day_start_time)

        for n in range(1, lesson_number):
            # avvalgi darsni qo'shamiz
            current += timedelta(minutes=cls.LESSON_DURATION)
            # keyin tegishli tanaffusni qo'shamiz
            if n == cls.LONG_BREAK_AFTER:
                current += timedelta(minutes=cls.LONG_BREAK)
            else:
                current += timedelta(minutes=cls.SHORT_BREAK)

        return current.time()

    def save(self, *args, **kwargs):
        # Agar kunning boshlanish vaqti berilgan bo'lsa, start_time shundan hisoblanadi
        if self.day_start_time:
            self.start_time = self.calculate_start_time(self.day_start_time, self.lesson_number)

        # end_time har doim start_time + 45 daqiqa
        start_dt = datetime.combine(datetime.today(), self.start_time)
        end_dt = start_dt + timedelta(minutes=self.LESSON_DURATION)
        self.end_time = end_dt.time()

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.school_class} - {self.subject} ({self.get_day_of_week_display()}, {self.lesson_number}-dars, {self.start_time}-{self.end_time})"



