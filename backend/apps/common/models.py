"""Reusable abstract models for every app in the project."""

from django.db import models
from django.utils.translation import gettext_lazy as _


class TimeStampedModel(models.Model):
    """Abstract model that tracks created and updated timestamps."""

    created_at = models.DateTimeField(_("created at"), auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True, editable=False)

    class Meta:
        abstract = True
