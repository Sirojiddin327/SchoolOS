"""Makes `SchoolClass.organization` mandatory.

Every row was pointed at the default organization in 0004, so this only tightens
the schema — it must never fail, and if it ever did, that would mean a class
exists outside any organization, which is exactly what we want to know about.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0004_backfill_schoolclass_organization"),
    ]

    operations = [
        migrations.AlterField(
            model_name="schoolclass",
            name="organization",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="classes",
                to="organizations.organization",
                verbose_name="organization",
            ),
        ),
    ]
