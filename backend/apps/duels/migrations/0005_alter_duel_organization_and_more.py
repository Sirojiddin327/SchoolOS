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
        ('duels', '0004_duel_organization_duelrating_organization_and_more'),
        ('organizations', '0002_default_school_and_memberships'),
        # A duel's organization is filled in gamification.0009, so this may only
        # tighten the column after that backfill has run.
        ('gamification', '0009_backfill_organization'),
    ]

    operations = [
        migrations.AlterField(
            model_name='duel',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='duels', to='organizations.organization', verbose_name='organization'),
        ),
        migrations.AlterField(
            model_name='duelrating',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='duel_ratings', to='organizations.organization', verbose_name='organization'),
        ),
    ]
