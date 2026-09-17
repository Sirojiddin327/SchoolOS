import asyncio

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone
from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from apps.academics.models import Lesson
from apps.attendance.models import Attendance
from apps.attendance.services import count_by_status
from apps.schools.models import SchoolClass
from apps.telegram_bot.models import TelegramAccount, TelegramLinkCode
from apps.users.models import StudentProfile, TeacherProfile

User = get_user_model()

# count_by_status runs a synchronous ORM query — bot handlers are async, so it
# must go through sync_to_async instead of being awaited/called directly.
acount_by_status = sync_to_async(count_by_status, thread_sensitive=True)

LESSONS_BUTTON = "📅 Bugungi darslar"
ATTENDANCE_BUTTON = "📊 Davomatim"
CLASSES_BUTTON = "🏫 Mening sinflarim"
STATS_BUTTON = "📊 Umumiy statistika"

STUDENT_MENU = ReplyKeyboardMarkup([[LESSONS_BUTTON, ATTENDANCE_BUTTON]], resize_keyboard=True)
TEACHER_MENU = ReplyKeyboardMarkup([[LESSONS_BUTTON, CLASSES_BUTTON]], resize_keyboard=True)
DIRECTOR_MENU = ReplyKeyboardMarkup([[STATS_BUTTON]], resize_keyboard=True)


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
    return account.user if account else None


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
            Q(teacher=profile) | Q(school_class__class_teacher=profile), date=today
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
            Q(class_teacher=profile) | Q(lessons__teacher=profile)
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

    return (
        "📊 Umumiy statistika:\n\n"
        f"👨‍🎓 Jami o'quvchilar: {await StudentProfile.objects.acount()}\n"
        f"👩‍🏫 Jami o'qituvchilar: {await TeacherProfile.objects.acount()}\n"
        f"🏫 Jami sinflar: {await SchoolClass.objects.acount()}\n"
        f"📅 Bugungi darslar: {await Lesson.objects.filter(date=today).acount()}\n\n"
        "Bugungi davomat:\n"
        f"✅ Keldi: {counts[Attendance.Status.PRESENT]}\n"
        f"🕐 Kechikdi: {counts[Attendance.Status.LATE]}\n"
        f"❌ Kelmadi: {counts[Attendance.Status.ABSENT]}"
    )


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_chat.id

    if context.args:
        code = context.args[0]
        link_code = await TelegramLinkCode.objects.select_related("user").filter(code=code).afirst()
        if link_code is None or not link_code.is_valid():
            await update.message.reply_text("❌ Kod noto'g'ri yoki muddati o'tgan.")
            return

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
        await update.message.reply_text(
            f"✅ Hisobingiz bog'landi: {name}", reply_markup=menu_for(link_code.user)
        )
        return

    user = await get_linked_user(telegram_id)
    if user:
        name = user.get_full_name() or user.username
        await update.message.reply_text(f"Salom, {name}! 👋", reply_markup=menu_for(user))
    else:
        await update.message.reply_text(
            "👋 SchoolOS botiga xush kelibsiz!\n\n"
            "Hisobingizni bog'lash uchun avval veb-saytda profilingizdan kod oling, "
            "so'ng shu yerga /start <kod> deb yuboring."
        )


async def handle_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_chat.id
    user = await get_linked_user(telegram_id)
    if user is None:
        await update.message.reply_text("Avval hisobingizni bog'lang: /start <kod>")
        return

    text = update.message.text
    if text == LESSONS_BUTTON:
        reply = await today_lessons_text(user)
    elif text == ATTENDANCE_BUTTON:
        reply = await attendance_summary_text(user)
    elif text == CLASSES_BUTTON:
        reply = await my_classes_text(user)
    elif text == STATS_BUTTON:
        reply = await director_stats_text()
    else:
        reply = "Iltimos, quyidagi menyudan tanlang."

    await update.message.reply_text(reply, reply_markup=menu_for(user))


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
