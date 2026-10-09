import asyncio

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from apps.academics.models import Lesson
from apps.attendance.models import Attendance
from apps.attendance.services import count_by_status
from apps.gamification.models import Streak, StudentAchievement, XPTransaction
from apps.learning.models import Test, TestAttempt
from apps.schools.models import SchoolClass
from apps.telegram_bot.models import (
    ParentLinkCode,
    ParentTelegramAccount,
    TelegramAccount,
    TelegramLinkCode,
)
from apps.users.models import StudentProfile, TeacherProfile

User = get_user_model()

# count_by_status runs a synchronous ORM query — bot handlers are async, so it
# must go through sync_to_async instead of being awaited/called directly.
acount_by_status = sync_to_async(count_by_status, thread_sensitive=True)

# `user.is_student`/`is_director` resolve to User.active_membership, another
# synchronous ORM query. Loading a user here and reading its role there would
# raise SynchronousOnlyOperation inside the async handler, so the membership
# is fetched once, from a worker thread, before any handler touches a role.
prime_role_cache = sync_to_async(lambda user: user.active_membership, thread_sensitive=True)

LESSONS_BUTTON = "📅 Bugungi darslar"
ATTENDANCE_BUTTON = "📊 Davomatim"
CLASSES_BUTTON = "🏫 Mening sinflarim"
STATS_BUTTON = "📊 Umumiy statistika"
TESTS_BUTTON = "🧪 Mavjud testlar"
XP_BUTTON = "🏆 Mening XP'im"
ACHIEVEMENTS_BUTTON = "🎖 Yutuqlarim"
CLASS_XP_BUTTON = "📈 Sinflar XP statistikasi"
PARENT_ATTENDANCE_BUTTON = "📊 Farzandim davomati"
PARENT_PROGRESS_BUTTON = "📈 Farzandim o'zlashtirishi"

STUDENT_MENU = ReplyKeyboardMarkup(
    [
        [LESSONS_BUTTON, ATTENDANCE_BUTTON],
        [TESTS_BUTTON, XP_BUTTON],
        [ACHIEVEMENTS_BUTTON],
    ],
    resize_keyboard=True,
)
TEACHER_MENU = ReplyKeyboardMarkup(
    [[LESSONS_BUTTON, CLASSES_BUTTON], [CLASS_XP_BUTTON]], resize_keyboard=True
)
DIRECTOR_MENU = ReplyKeyboardMarkup([[STATS_BUTTON]], resize_keyboard=True)
PARENT_MENU = ReplyKeyboardMarkup(
    [[PARENT_ATTENDANCE_BUTTON, PARENT_PROGRESS_BUTTON]], resize_keyboard=True
)


def menu_for(user) -> ReplyKeyboardMarkup:
    if user.is_director:
        return DIRECTOR_MENU
    if user.is_teacher:
        return TEACHER_MENU
    return STUDENT_MENU


async def get_linked_user(telegram_id: int):
    account = (
        await TelegramAccount.objects.select_related("user")
        .filter(telegram_id=telegram_id)
        .afirst()
    )
    if account is None:
        return None
    await prime_role_cache(account.user)
    return account.user


async def get_linked_parent_students(telegram_id: int) -> list:
    """Every child this chat is linked to as a parent — usually one, but a
    parent may link more than one child, each with its own code."""
    return [
        account.student
        async for account in ParentTelegramAccount.objects.select_related("student__user").filter(
            telegram_id=telegram_id
        )
    ]


async def today_lessons_text(user) -> str:
    today = timezone.localdate()

    if user.is_student:
        profile = await StudentProfile.objects.select_related("school_class").aget(user=user)
        if not profile.school_class_id:
            return "Siz hali biror sinfga biriktirilmagansiz."
        queryset = Lesson.objects.filter(school_class_id=profile.school_class_id, date=today)
    elif user.is_teacher:
        profile = await TeacherProfile.objects.aget(user=user)
        queryset = Lesson.objects.filter(
            Q(teacher=profile)
            | Q(secondary_teacher=profile)
            | Q(school_class__class_teacher=profile),
            date=today,
        ).distinct()
    else:
        return "Bu buyruq faqat o'quvchi va o'qituvchilar uchun."

    lessons = [
        lesson
        async for lesson in queryset.select_related("subject", "school_class").order_by(
            "start_time"
        )
    ]
    if not lessons:
        return f"📅 Bugun ({today:%d.%m.%Y}) darslar yo'q."

    lines = [f"📅 Bugungi darslar ({today:%d.%m.%Y}):", ""]
    for lesson in lessons:
        room = f" · {lesson.room}" if lesson.room else ""
        lines.append(
            f"{lesson.start_time:%H:%M}–{lesson.end_time:%H:%M} "
            f"{lesson.subject.name} ({lesson.school_class.name}){room}"
        )
    return "\n".join(lines)


async def attendance_summary_text(user) -> str:
    profile = await StudentProfile.objects.aget(user=user)
    counts = await acount_by_status(Attendance.objects.filter(student=profile))
    return (
        "📊 Umumiy davomatingiz:\n\n"
        f"✅ Keldi: {counts[Attendance.Status.PRESENT]}\n"
        f"🕐 Kechikdi: {counts[Attendance.Status.LATE]}\n"
        f"❌ Kelmadi: {counts[Attendance.Status.ABSENT]}\n"
        f"📄 Sababli: {counts[Attendance.Status.EXCUSED]}"
    )


async def my_classes_text(user) -> str:
    profile = await TeacherProfile.objects.aget(user=user)
    classes = [
        cls
        async for cls in SchoolClass.objects.filter(
            Q(class_teacher=profile) | Q(lessons__teacher=profile) | Q(lessons__secondary_teacher=profile)
        ).distinct()
    ]
    if not classes:
        return "Sizga hali sinf biriktirilmagan."

    lines = ["🏫 Mening sinflarim:", ""]
    for cls in classes:
        suffix = " (sinf rahbari)" if cls.class_teacher_id == profile.id else ""
        lines.append(f"• {cls.name}{suffix}")
    return "\n".join(lines)


async def director_stats_text() -> str:
    today = timezone.localdate()
    counts = await acount_by_status(Attendance.objects.filter(lesson__date=today))
    xp_today = await XPTransaction.objects.filter(created_at__date=today).aaggregate(total=Sum("amount"))
    top_class = await SchoolClass.objects.order_by("-total_xp").afirst()

    lines = [
        "📊 Umumiy statistika:",
        "",
        f"👨‍🎓 Jami o'quvchilar: {await StudentProfile.objects.acount()}",
        f"👩‍🏫 Jami o'qituvchilar: {await TeacherProfile.objects.acount()}",
        f"🏫 Jami sinflar: {await SchoolClass.objects.acount()}",
        f"📅 Bugungi darslar: {await Lesson.objects.filter(date=today).acount()}",
        "",
        "Bugungi davomat:",
        f"✅ Keldi: {counts[Attendance.Status.PRESENT]}",
        f"🕐 Kechikdi: {counts[Attendance.Status.LATE]}",
        f"❌ Kelmadi: {counts[Attendance.Status.ABSENT]}",
        "",
        f"⭐ Bugun berilgan XP: {xp_today['total'] or 0}",
    ]
    if top_class:
        lines.append(f"🥇 Yetakchi sinf: {top_class.name} ({top_class.total_xp} XP)")
    return "\n".join(lines)


async def available_tests_text(user) -> str:
    profile = await StudentProfile.objects.select_related("school_class").aget(user=user)
    if not profile.school_class_id:
        return "Siz hali biror sinfga biriktirilmagansiz."

    taken_test_ids = {
        test_id
        async for test_id in TestAttempt.objects.filter(student=profile).values_list("test_id", flat=True)
    }
    queryset = (
        Test.objects.filter(is_published=True, school_class_id=profile.school_class_id)
        .exclude(id__in=taken_test_ids)
        .select_related("subject")
        .order_by("-created_at")[:10]
    )
    tests = [test async for test in queryset]
    if not tests:
        return "🧪 Hozircha yangi test yo'q."

    lines = ["🧪 Mavjud testlar:", ""]
    for test in tests:
        lines.append(f"• {test.subject.name}: {test.title} (max {test.max_xp} XP)")
    lines.append("\nTestni topshirish uchun veb-saytga kiring.")
    return "\n".join(lines)


async def my_xp_text(user) -> str:
    profile = await StudentProfile.objects.aget(user=user)
    streak, _created = await Streak.objects.aget_or_create(student=profile)
    return (
        "🏆 Mening XP'im:\n\n"
        f"⭐ Jami XP: {profile.total_xp}\n"
        f"🔥 Joriy seriya: {streak.current_streak} kun\n"
        f"🏅 Eng uzun seriya: {streak.longest_streak} kun"
    )


async def my_achievements_text(user) -> str:
    profile = await StudentProfile.objects.aget(user=user)
    unlocked = [
        student_achievement
        async for student_achievement in StudentAchievement.objects.select_related("achievement")
        .filter(student=profile)
        .order_by("-unlocked_at")
    ]
    if not unlocked:
        return "🎖 Hali birorta yutuq ochilmagan. Test va topshiriqlarni bajarib, birinchi yutuqingizni oching!"

    lines = ["🎖 Yutuqlarim:", ""]
    for student_achievement in unlocked:
        achievement = student_achievement.achievement
        lines.append(f"{achievement.icon} {achievement.name} — {achievement.description}")
    return "\n".join(lines)


async def class_xp_text(user) -> str:
    profile = await TeacherProfile.objects.aget(user=user)
    classes = [
        cls
        async for cls in SchoolClass.objects.filter(
            Q(class_teacher=profile) | Q(lessons__teacher=profile) | Q(lessons__secondary_teacher=profile)
        ).distinct()
    ]
    if not classes:
        return "Sizga hali sinf biriktirilmagan."

    lines = ["📈 Sinflar XP statistikasi:", ""]
    for cls in sorted(classes, key=lambda school_class: -school_class.total_xp):
        lines.append(f"• {cls.name}: {cls.total_xp} XP")
    return "\n".join(lines)


async def parent_attendance_text(students: list) -> str:
    lines = ["📊 Farzandingizning davomati:"]
    for student in students:
        name = student.user.get_full_name() or student.user.username
        counts = await acount_by_status(Attendance.objects.filter(student=student))
        lines.append(
            f"\n👤 {name}:\n"
            f"✅ Keldi: {counts[Attendance.Status.PRESENT]}\n"
            f"🕐 Kechikdi: {counts[Attendance.Status.LATE]}\n"
            f"❌ Kelmadi: {counts[Attendance.Status.ABSENT]}\n"
            f"📄 Sababli: {counts[Attendance.Status.EXCUSED]}"
        )
    return "\n".join(lines)


async def parent_progress_text(students: list) -> str:
    lines = ["📈 Farzandingizning o'zlashtirishi:"]
    for student in students:
        name = student.user.get_full_name() or student.user.username
        stats = await TestAttempt.objects.filter(
            student=student, status=TestAttempt.Status.SUBMITTED
        ).aaggregate(avg_score=Avg("score_percent"), count=Count("id"))
        avg_score = stats["avg_score"] or 0
        lines.append(
            f"\n👤 {name}:\n"
            f"⭐ Jami XP: {student.total_xp}\n"
            f"🧪 Topshirilgan testlar: {stats['count']}\n"
            f"📊 O'rtacha natija: {avg_score:.0f}%"
        )
    return "\n".join(lines)


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_chat.id

    if context.args:
        code = context.args[0]

        link_code = await TelegramLinkCode.objects.select_related("user").filter(code=code).afirst()
        if link_code is not None and link_code.is_valid():
            await TelegramAccount.objects.filter(telegram_id=telegram_id).adelete()
            await TelegramAccount.objects.aupdate_or_create(
                user=link_code.user,
                defaults={
                    "telegram_id": telegram_id,
                    "telegram_username": update.effective_user.username or "",
                },
            )
            link_code.used_at = timezone.now()
            await link_code.asave(update_fields=["used_at"])

            name = link_code.user.get_full_name() or link_code.user.username
            await prime_role_cache(link_code.user)
            await update.message.reply_text(
                f"✅ Hisobingiz bog'landi: {name}", reply_markup=menu_for(link_code.user)
            )
            return

        parent_code = (
            await ParentLinkCode.objects.select_related("student__user").filter(code=code).afirst()
        )
        if parent_code is not None and parent_code.is_valid():
            # Not a delete-then-create like the account link above — a parent
            # may link several children over time, one code per child.
            await ParentTelegramAccount.objects.aupdate_or_create(
                student=parent_code.student,
                telegram_id=telegram_id,
                defaults={"telegram_username": update.effective_user.username or ""},
            )
            parent_code.used_at = timezone.now()
            await parent_code.asave(update_fields=["used_at"])

            child_name = (
                parent_code.student.user.get_full_name() or parent_code.student.user.username
            )
            await update.message.reply_text(
                f"✅ {child_name} farzandingizning hisobiga bog'landingiz. "
                "Endi uning davomati va o'zlashtirishi haqida shu yerdan xabar olasiz.",
                reply_markup=PARENT_MENU,
            )
            return

        await update.message.reply_text("❌ Kod noto'g'ri yoki muddati o'tgan.")
        return

    user = await get_linked_user(telegram_id)
    if user:
        name = user.get_full_name() or user.username
        await update.message.reply_text(f"Salom, {name}! 👋", reply_markup=menu_for(user))
        return

    children = await get_linked_parent_students(telegram_id)
    if children:
        await update.message.reply_text("👋 Xush kelibsiz!", reply_markup=PARENT_MENU)
        return

    await update.message.reply_text(
        "👋 SchoolOS botiga xush kelibsiz!\n\n"
        "Hisobingizni bog'lash uchun avval veb-saytda profilingizdan kod oling, "
        "so'ng shu yerga /start <kod> deb yuboring."
    )


async def handle_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_chat.id
    text = update.message.text

    user = await get_linked_user(telegram_id)
    if user is not None:
        if text == LESSONS_BUTTON:
            reply = await today_lessons_text(user)
        elif text == ATTENDANCE_BUTTON:
            reply = await attendance_summary_text(user)
        elif text == CLASSES_BUTTON:
            reply = await my_classes_text(user)
        elif text == STATS_BUTTON:
            reply = await director_stats_text()
        elif text == TESTS_BUTTON:
            reply = await available_tests_text(user)
        elif text == XP_BUTTON:
            reply = await my_xp_text(user)
        elif text == ACHIEVEMENTS_BUTTON:
            reply = await my_achievements_text(user)
        elif text == CLASS_XP_BUTTON:
            reply = await class_xp_text(user)
        else:
            reply = "Iltimos, quyidagi menyudan tanlang."
        await update.message.reply_text(reply, reply_markup=menu_for(user))
        return

    children = await get_linked_parent_students(telegram_id)
    if children:
        if text == PARENT_ATTENDANCE_BUTTON:
            reply = await parent_attendance_text(children)
        elif text == PARENT_PROGRESS_BUTTON:
            reply = await parent_progress_text(children)
        else:
            reply = "Iltimos, quyidagi menyudan tanlang."
        await update.message.reply_text(reply, reply_markup=PARENT_MENU)
        return

    await update.message.reply_text("Avval hisobingizni bog'lang: /start <kod>")


class Command(BaseCommand):
    help = "Run the SchoolOS Telegram bot (long polling)."

    def handle(self, *args, **options):
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            self.stderr.write("TELEGRAM_BOT_TOKEN is not set — add it to your .env first.")
            return

        # Python 3.12+ no longer lets asyncio.get_event_loop() create one implicitly,
        # which is what Application.run_polling() relies on internally.
        asyncio.set_event_loop(asyncio.new_event_loop())

        application = Application.builder().token(token).build()
        application.add_handler(CommandHandler("start", handle_start))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_menu))

        self.stdout.write(self.style.SUCCESS("SchoolOS Telegram bot started (polling)..."))
        application.run_polling(allowed_updates=Update.ALL_TYPES)
