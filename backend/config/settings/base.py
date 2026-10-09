import os
from datetime import timedelta
from pathlib import Path

import environ
from celery.schedules import crontab

env = environ.Env()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

environ.Env.read_env(os.path.join(BASE_DIR, ".env"), overwrite=False)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="change-me-in-production")

DEBUG = env("DJANGO_DEBUG", default="True").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

INSTALLED_APPS = [
    "jazzmin",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    # Local
    "apps.common",
    "apps.organizations",
    "apps.users",
    "apps.schools",
    "apps.academics",
    "apps.attendance",
    "apps.notifications",
    "apps.dashboard",
    "apps.school_config",
    "apps.telegram_bot",
    "apps.learning",
    "apps.gamification",
    "apps.tasks",
    "apps.duels",
    "apps.remedial",
    "apps.games",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.school_config.middleware.SchoolTimeLockMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

AUTH_USER_MODEL = "users.User"

DATABASES = {
    "default": {
        "ENGINE": env(
            "DJANGO_DB_ENGINE",
            default="django.db.backends.sqlite3",
        ),
        "NAME": env("DJANGO_DB_NAME", default=str(BASE_DIR / "db.sqlite3")),
        "USER": env("DJANGO_DB_USER", default=""),
        "PASSWORD": env("DJANGO_DB_PASSWORD", default=""),
        "HOST": env("DJANGO_DB_HOST", default=""),
        "PORT": env("DJANGO_DB_PORT", default=""),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Tashkent"

USE_I18N = True

USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------- Django REST Framework ----------
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.organizations.authentication.OrganizationHeaderAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
    },
}

# ---------- Simple JWT ----------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ---------- drf-spectacular ----------
SPECTACULAR_SETTINGS = {
    "TITLE": "SchoolOS API",
    "DESCRIPTION": "CRM + Learning Platform for schools: attendance, classes, lessons, notifications.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------- CORS ----------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

# ---------- Telegram bot ----------
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="")
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", default="")

# ---------- AI completions (apps.common.gemini) ----------
# Gemini is the primary provider; Groq is an automatic fallback used whenever
# Gemini doesn't return a usable completion (quota/rate-limit exhaustion,
# network failure, or no Gemini key configured at all) — see call_gemini().
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
GEMINI_MODEL = env("GEMINI_MODEL", default="gemini-3.6-flash")
GROQ_API_KEY = env("GROQ_API_KEY", default="")
GROQ_MODEL = env("GROQ_MODEL", default="openai/gpt-oss-120b")

# ---------- Cache ----------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# ---------- Celery ----------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULE = {
    "send-daily-schedules": {
        "task": "apps.academics.tasks.send_daily_schedules",
        # crontab is evaluated in CELERY_TIMEZONE, which is TIME_ZONE above —
        # so this is 07:00 Asia/Tashkent, not 07:00 UTC. Asia/Tashkent is UTC+5
        # all year (no DST), but the crontab is still resolved through the
        # timezone rather than offset, so it stays correct if that ever changes.
        "schedule": crontab(hour=7, minute=0),
    },
    "ensure-current-week-lessons": {
        "task": "apps.academics.tasks.ensure_current_week_lessons",
        "schedule": crontab(hour=6, minute=0, day_of_week=1),  # Monday 06:00, before the 07:00 digest
    },
    "remind-unmarked-attendance": {
        "task": "apps.attendance.tasks.remind_unmarked_attendance",
        "schedule": 120.0,  # every 2 minutes; well under the 10-minute reminder lead
    },
    "refill-low-question-pools": {
        "task": "apps.games.tasks.refill_low_pools",
        "schedule": 21_600.0,  # every 6 hours — pools drain slowly, no need to poll often
    },
}

# ---------- Jazzmin Admin ----------
JAZZMIN_SETTINGS = {
    "site_title": "SchoolOS Admin",
    "site_header": "SchoolOS",
    "site_brand": "SchoolOS Admin",
    "site_logo": None,
    "login_logo": None,
    "login_logo_dark": None,
    "site_logo_classes": "img-circle",
    "site_icon": None,
    "welcome_sign": "Welcome to SchoolOS Administration",
    "copyright": "SchoolOS",
    "search_model": ["users.User", "schools.School", "academics.Class"],
    "user_avatar": None,
    "topmenu_links": [
        {"name": "Home", "url": "admin:index", "permissions": ["auth.view_user"]},
        {"model": "users.User"},
        {"model": "schools.School"},
        {"app": "academics"},
    ],
    "usermenu_links": [
        {"name": "View site", "url": "/", "new_window": True},
        {"model": "users.User"},
    ],
    "show_sidebar": True,
    "navigation_expanded": True,
    "hide_apps": [],
    "hide_models": [],
    "order_with_respect_to": [
        "users",
        "schools",
        "academics",
        "attendance",
        "gamification",
        "tasks",
        "duels",
        "remedial",
        "games",
        "learning",
        "notifications",
        "dashboard",
        "school_config",
        "telegram_bot",
        "organizations",
    ],
    "icons": {
        "auth": "fas fa-users-cog",
        "users.User": "fas fa-user",
        "users.Teacher": "fas fa-chalkboard-teacher",
        "users.Student": "fas fa-user-graduate",
        "users.Parent": "fas fa-user-friends",
        "schools.School": "fas fa-school",
        "schools.Campus": "fas fa-building",
        "academics.Class": "fas fa-chalkboard",
        "academics.Subject": "fas fa-book",
        "academics.Lesson": "fas fa-calendar-alt",
        "academics.Enrollment": "fas fa-user-plus",
        "attendance.Attendance": "fas fa-clipboard-check",
        "attendance.AttendanceRecord": "fas fa-list",
        "gamification.Badge": "fas fa-medal",
        "gamification.Achievement": "fas fa-trophy",
        "gamification.PointTransaction": "fas fa-coins",
        "tasks.Task": "fas fa-tasks",
        "tasks.Submission": "fas fa-file-upload",
        "duels.Duel": "fas fa-fist-raised",
        "remedial.RemedialPlan": "fas fa-prescription",
        "games.GameSession": "fas fa-gamepad",
        "learning.LearningPath": "fas fa-route",
        "notifications.Notification": "fas fa-bell",
        "dashboard.DashboardWidget": "fas fa-chart-bar",
        "telegram_bot.TelegramUser": "fas fa-robot",
        "organizations.Organization": "fas fa-sitemap",
    },
    "default_icon_parents": "fas fa-chevron-circle-right",
    "default_icon_children": "fas fa-circle",
    "related_modal_active": False,
    "custom_css": None,
    "custom_js": None,
    "use_google_fonts_cdn": True,
    "show_ui_builder": True,
    "changeform_format": "horizontal_tabs",
    "changeform_format_overrides": {
        "users.User": "collapsible",
        "auth.Group": "vertical_tabs",
    },
}

JAZZMIN_UI_TWEAKS = {
    "navbar_small_text": False,
    "footer_small_text": False,
    "body_small_text": False,
    "brand_small_text": False,
    "brand_colour": "navbar-primary",
    "accent": "accent-primary",
    "navbar": "navbar-primary navbar-dark",
    "no_navbar_border": False,
    "navbar_fixed": True,
    "layout_boxed": False,
    "footer_fixed": False,
    "sidebar_fixed": True,
    "sidebar": "sidebar-dark-primary",
    "sidebar_nav_small_text": False,
    "sidebar_disable_expand": False,
    "sidebar_nav_child_indent": False,
    "sidebar_nav_compact_style": False,
    "sidebar_nav_legacy_style": False,
    "sidebar_nav_flat_style": False,
    "theme": "default",
    "dark_mode_theme": "darkly",
    "button_classes": {
        "primary": "btn-primary",
        "secondary": "btn-secondary",
        "info": "btn-info",
        "warning": "btn-warning",
        "danger": "btn-danger",
        "success": "btn-success",
    },
}
