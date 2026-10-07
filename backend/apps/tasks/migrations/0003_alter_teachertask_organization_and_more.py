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
        ('organizations', '0002_default_school_and_memberships'),
        ('tasks', '0002_teachertask_organization_and_more'),
        # A task inherits its class's organization, which gamification.0009 reads.
        ('gamification', '0009_backfill_organization'),
    ]

    operations = [
        migrations.AlterField(
            model_name='teachertask',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_tasks', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='teachertaskassignment',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_task_assignments', to='organizations.organization', verbose_name='organization'),
        ),
    ]
