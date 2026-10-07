"""Tightens `organization` to NOT NULL now that the backfill has filled it.

The column was added nullable so the backfill could run against tables that
already held rows. This only removes the nullability, and it carries no data
migration: a row still missing an organization is a bug we want to hear
about, not paper over with a guessed default.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0008_backfill_lesson_organization'),
        ('organizations', '0002_default_school_and_memberships'),
    ]

    operations = [
        migrations.AlterField(
            model_name='dailyscheduledigest',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='daily_schedule_digests', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='lesson',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lessons', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='timetableslot',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='timetable_slots', to='organizations.organization', verbose_name='organization'),
        ),
    ]
