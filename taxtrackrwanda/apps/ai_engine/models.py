"""Models for AI engine app."""
from __future__ import annotations

from django.conf import settings
from django.db import models


class AIAlert(models.Model):
    """AI-generated risk alert for merchant compliance review."""

    class Reason(models.TextChoices):
        HIGH_RISK_SCORE = "high_risk_score", "Risk score > 70"
        HIGH_TAX_DEVIATION = "high_tax_deviation", "Tax deviation > 30%"
        LOW_GRADE = "low_grade", "Merchant grade = D"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    merchant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ai_alerts")
    reason = models.CharField(max_length=64, choices=Reason.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"AIAlert({self.merchant_id}, {self.reason}, {self.severity})"
