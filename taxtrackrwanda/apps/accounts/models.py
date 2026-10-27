"""Accounts domain models."""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models

from apps.compliance.services import compute_compliance_percentage

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Application user authenticated by TIN."""

    class Role(models.TextChoices):
        FACTORY = "factory", "Factory"
        WHOLESALER = "wholesaler", "Wholesaler"
        RETAILER = "retailer", "Retailer"
        RRA = "rra", "RRA"

    tin = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        validators=[RegexValidator(r"^[A-Za-z0-9-]+$", "TIN can only contain letters, numbers, and hyphens.")],
        help_text="Tax Identification Number used to log in.",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    phone_number = models.CharField(max_length=20)

    is_tax_compliant = models.BooleanField(default=True)
    total_tax_due = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0.00"))
    total_tax_paid = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0.00"))
    frozen_tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0.00"))
    compliance_score = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("100.00"))
    compliance_grade = models.CharField(max_length=1, default="A")
    fraud_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))

    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "tin"
    REQUIRED_FIELDS = ["phone_number", "role"]

    class Meta:
        ordering = ["tin"]
        verbose_name = "user"
        verbose_name_plural = "users"


    @property
    def compliance_percentage(self) -> Decimal:
        return compute_compliance_percentage(
            total_tax_due=self.total_tax_due,
            total_tax_paid=self.total_tax_paid,
            frozen_tax_amount=self.frozen_tax_amount,
        )

    def __str__(self) -> str:
        return self.tin
