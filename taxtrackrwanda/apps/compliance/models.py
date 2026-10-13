"""Compliance domain models."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F
from django.utils import timezone

from apps.compliance.services import is_tax_compliant


class TaxPayment(models.Model):
    """Records tax payment transactions for a merchant."""

    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="tax_payments",
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    is_late = models.BooleanField(default=False)
    payment_delay_days = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        super().clean()
        if self.amount <= 0:
            raise ValidationError({"amount": "Payment amount must be greater than zero."})
        if self.payment_delay_days < 0:
            raise ValidationError({"payment_delay_days": "Payment delay days cannot be negative."})

    def save(self, *args, **kwargs):
        is_create = self._state.adding
        self.full_clean()

        with transaction.atomic():
            saved = super().save(*args, **kwargs)
            if is_create:
                user_model = type(self.payer)
                user_model.objects.filter(pk=self.payer_id).update(total_tax_paid=F("total_tax_paid") + self.amount)
                user = user_model.objects.select_for_update().get(pk=self.payer_id)
                user.is_tax_compliant = is_tax_compliant(
                    total_tax_due=user.total_tax_due,
                    total_tax_paid=user.total_tax_paid,
                    frozen_tax_amount=user.frozen_tax_amount,
                )
                user.save(update_fields=["is_tax_compliant", "updated_at"])
                from apps.compliance.scoring import update_user_compliance_score

                update_user_compliance_score(user_id=self.payer_id)
            return saved

    def __str__(self) -> str:
        return f"{self.payer} paid {self.amount}"


class TaxDispute(models.Model):
    """Represents a dispute raised against transaction tax within a 48-hour window."""

    DISPUTE_WINDOW_HOURS = 48

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        UPHELD = "upheld", "Upheld"
        REJECTED = "rejected", "Rejected"

    transaction = models.ForeignKey(
        "transactions.Transaction",
        on_delete=models.PROTECT,
        related_name="tax_disputes",
    )
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="tax_disputes",
    )
    reason = models.TextField()
    evidence = models.FileField(upload_to="tax_disputes/evidence/")
    disputed_tax_amount = models.DecimalField(max_digits=18, decimal_places=2, editable=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(editable=False)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        super().clean()
        if not self.transaction_id:
            return

        if self._state.adding:
            now = timezone.now()
            dispute_deadline = self.transaction.created_at + timedelta(hours=self.DISPUTE_WINDOW_HOURS)
            if now > dispute_deadline:
                raise ValidationError({"transaction": "The 48-hour dispute window has expired for this transaction."})

        allowed_users = {self.transaction.seller_id, self.transaction.buyer_id}
        if self.raised_by_id not in allowed_users:
            raise ValidationError({"raised_by": "Only participants in the transaction can raise a dispute."})

    def save(self, *args, **kwargs):
        is_create = self._state.adding
        if is_create:
            self.disputed_tax_amount = self.transaction.tax_amount
            self.expires_at = self.transaction.created_at + timedelta(hours=self.DISPUTE_WINDOW_HOURS)

        self.full_clean()

        with transaction.atomic():
            saved = super().save(*args, **kwargs)
            if is_create:
                self._freeze_disputed_tax()
                self._create_audit_event(
                    action=DisputeAuditTrail.Action.CREATED,
                    details="Dispute created and tax amount frozen pending review.",
                )
                from apps.compliance.scoring import update_user_compliance_score

                update_user_compliance_score(user_id=self.transaction.seller_id)
            return saved

    def resolve(self, *, actor, uphold: bool, notes: str = ""):
        if self.status != self.Status.OPEN:
            raise ValidationError("Only open disputes can be resolved.")

        with transaction.atomic():
            self.status = self.Status.UPHELD if uphold else self.Status.REJECTED
            self.resolved_at = timezone.now()
            self.save(update_fields=["status", "resolved_at"])

            self._release_frozen_tax(uphold=uphold)
            action = DisputeAuditTrail.Action.UPHELD if uphold else DisputeAuditTrail.Action.REJECTED
            details = notes or (
                "Dispute upheld; disputed tax removed from tax due."
                if uphold
                else "Dispute rejected; frozen tax restored to active obligations."
            )
            self._create_audit_event(action=action, actor=actor, details=details)
            from apps.compliance.scoring import update_user_compliance_score

            update_user_compliance_score(user_id=self.transaction.seller_id)

    def _freeze_disputed_tax(self):
        user_model = type(self.transaction.seller)
        user_model.objects.filter(pk=self.transaction.seller_id).update(
            frozen_tax_amount=F("frozen_tax_amount") + self.disputed_tax_amount
        )
        seller = user_model.objects.select_for_update().get(pk=self.transaction.seller_id)
        seller.is_tax_compliant = is_tax_compliant(
            total_tax_due=seller.total_tax_due,
            total_tax_paid=seller.total_tax_paid,
            frozen_tax_amount=seller.frozen_tax_amount,
        )
        seller.save(update_fields=["is_tax_compliant", "updated_at"])

    def _release_frozen_tax(self, *, uphold: bool):
        user_model = type(self.transaction.seller)
        user_model.objects.filter(pk=self.transaction.seller_id).update(
            frozen_tax_amount=F("frozen_tax_amount") - self.disputed_tax_amount
        )

        if uphold:
            user_model.objects.filter(pk=self.transaction.seller_id).update(
                total_tax_due=F("total_tax_due") - self.disputed_tax_amount
            )

        seller = user_model.objects.select_for_update().get(pk=self.transaction.seller_id)
        if seller.frozen_tax_amount < 0:
            seller.frozen_tax_amount = Decimal("0.00")
        if seller.total_tax_due < 0:
            seller.total_tax_due = Decimal("0.00")
        seller.is_tax_compliant = is_tax_compliant(
            total_tax_due=seller.total_tax_due,
            total_tax_paid=seller.total_tax_paid,
            frozen_tax_amount=seller.frozen_tax_amount,
        )
        seller.save(update_fields=["frozen_tax_amount", "total_tax_due", "is_tax_compliant", "updated_at"])

    def _create_audit_event(self, *, action: str, details: str, actor=None):
        DisputeAuditTrail.objects.create(
            dispute=self,
            action=action,
            actor=actor,
            details=details,
        )


class DisputeAuditTrail(models.Model):
    """Immutable audit trail for dispute actions."""

    class Action(models.TextChoices):
        CREATED = "created", "Created"
        UPHELD = "upheld", "Upheld"
        REJECTED = "rejected", "Rejected"

    dispute = models.ForeignKey(TaxDispute, on_delete=models.CASCADE, related_name="audit_trail")
    action = models.CharField(max_length=20, choices=Action.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dispute_actions",
    )
    details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.dispute_id}:{self.action}@{self.created_at.isoformat()}"


class TaxAlert(models.Model):
    """Tax anomaly alert generated by AI monitoring engine."""

    transaction = models.OneToOneField(
        "transactions.Transaction",
        on_delete=models.CASCADE,
        related_name="tax_alert",
    )
    merchant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="tax_alerts",
    )
    expected_tax = models.DecimalField(max_digits=18, decimal_places=2)
    actual_tax = models.DecimalField(max_digits=18, decimal_places=2)
    deviation_percentage = models.DecimalField(max_digits=7, decimal_places=2)
    threshold_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("30.00"))
    message = models.CharField(max_length=255)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Alert tx={self.transaction_id} deviation={self.deviation_percentage}%"
