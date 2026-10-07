"""Reusable abstract models for every app in the project."""

from typing import ClassVar

from django.db import models
from django.utils.translation import gettext_lazy as _


class TimeStampedModel(models.Model):
    """Abstract model that tracks created and updated timestamps."""

    created_at = models.DateTimeField(_("created at"), auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True, editable=False)

    class Meta:
        abstract = True


class OrganizationScopedMixin(models.Model):
    """Fills a required `organization` FK from the row's own parent.

    Tenancy is denormalized onto every content row so a queryset can filter by
    tenant without joining through a chain of parents. That only stays honest if
    the column is *copied* from the parent rather than passed in separately by
    each caller: fifty call sites that each have to remember it is fifty chances
    to write a row that disagrees with its own class. So this mixin reads it
    from `organization_source` at save time and refuses to write a row it cannot
    attribute to a tenant.

    Subclasses must declare the `organization` FK themselves — each one needs its
    own `related_name` — and set `organization_source` to a dotted attribute path
    ending at an `Organization` or at an object with one, e.g.
    `"school_class.organization"` or `"student.organization"`.

    An explicit `organization=` still wins; the source is only consulted when the
    caller left it unset. `bulk_create` bypasses `save()` entirely, so rows built
    that way must carry `organization` themselves.
    """

    #: Dotted attribute path to this row's organization. None means the model
    #: must always be given one explicitly.
    organization_source: ClassVar[str | None] = None

    class Meta:
        abstract = True

    def resolve_organization(self) -> models.Model | None:
        """Walk `organization_source`, tolerating a null link part-way along."""
        if not self.organization_source:
            return None
        value = self
        for attribute in self.organization_source.split("."):
            value = getattr(value, attribute, None)
            if value is None:
                return None
        return value

    def save(self, *args, **kwargs):
        if self.organization_id is None:
            organization = self.resolve_organization()
            if organization is None:
                raise ValueError(
                    f"{type(self).__name__} has no organization and none could be "
                    f"derived from {self.organization_source or '<no source>'!r}. "
                    "Pass organization= explicitly."
                )
            self.organization_id = organization.pk
        super().save(*args, **kwargs)