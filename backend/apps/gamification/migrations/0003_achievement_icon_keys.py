from django.db import migrations

# The frontend now renders `Achievement.icon` through a small set of named
# lucide icons (see frontend/src/lib/achievementIcons.tsx) instead of raw
# emoji, so the starter achievements seeded in 0002 need their icon values
# migrated to match.
ICON_KEY_BY_NAME = {
    "First Test": "target",
    "Perfect Score": "percent",
    "XP Hunter": "zap",
    "7 Day Streak": "flame",
}


def rename_icon_keys(apps, schema_editor):
    Achievement = apps.get_model("gamification", "Achievement")
    for name, icon in ICON_KEY_BY_NAME.items():
        Achievement.objects.filter(name=name).update(icon=icon)


def restore_emoji_icons(apps, schema_editor):
    Achievement = apps.get_model("gamification", "Achievement")
    emoji_by_name = {
        "First Test": "🎯",
        "Perfect Score": "💯",
        "XP Hunter": "⚡",
        "7 Day Streak": "🔥",
    }
    for name, icon in emoji_by_name.items():
        Achievement.objects.filter(name=name).update(icon=icon)


class Migration(migrations.Migration):

    dependencies = [
        ("gamification", "0002_seed_achievements"),
    ]

    operations = [
        migrations.RunPython(rename_icon_keys, restore_emoji_icons),
    ]
