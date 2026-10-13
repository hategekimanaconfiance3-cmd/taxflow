"""Products domain models."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Product(models.Model):
    """Product created by a factory merchant."""

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="products_created",
    )
    base_price = models.DecimalField(max_digits=18, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18.00"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "name"]

    def clean(self):
        super().clean()
        if self.created_by_id and getattr(self.created_by, "role", None) != "factory":
            raise ValidationError({"created_by": "Only users with the factory role can create products."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Inventory(models.Model):
    """Inventory state for each owner/product pair."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inventories",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="inventories",
    )
    quantity = models.PositiveIntegerField(default=0)
    locked_purchase_price = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "product"], name="uniq_inventory_owner_product"),
        ]
        ordering = ["owner", "product"]

    def __str__(self) -> str:
        return f"{self.owner} - {self.product} ({self.quantity})"
