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
        ('learning', '0004_backfill_organization'),
        ('organizations', '0002_default_school_and_memberships'),
    ]

    operations = [
        migrations.AlterField(
            model_name='activity',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activities', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='activityresult',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_results', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='activitysubmission',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_submissions', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='test',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tests', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='testattempt',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='test_attempts', to='organizations.organization', verbose_name='organization'),
        ),
    ]
