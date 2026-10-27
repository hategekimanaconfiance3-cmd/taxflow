"""AI alert engine implementation."""
from __future__ import annotations

from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum

from apps.ai_engine.models import AIAlert
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.transactions.models import Transaction


HIGH_RISK_THRESHOLD = Decimal("70.00")
HIGH_TAX_DEVIATION_THRESHOLD = Decimal("30.00")
EXPECTED_VAT_RATE = Decimal("0.18")


def _compute_tax_deviation_percentage(*, transaction_obj: "Transaction") -> Decimal:
    transaction_model = type(transaction_obj)
    historical = (
        transaction_model.objects.filter(status=transaction_model.Status.COMPLETED, seller_id=transaction_obj.seller_id)
        .exclude(pk=transaction_obj.pk)
        .aggregate(
            total_amount=Sum(
                ExpressionWrapper(F("selling_price") * F("quantity"), output_field=DecimalField(max_digits=20, decimal_places=2))
            ),
            total_tax=Sum("tax_amount"),
        )
    )

    total_amount = historical["total_amount"] or Decimal("0.00")
    total_tax = historical["total_tax"] or Decimal("0.00")

    if total_amount > 0:
        expected_rate = total_tax / total_amount
    else:
        expected_rate = EXPECTED_VAT_RATE

    expected_tax = (transaction_obj.selling_price * transaction_obj.quantity * expected_rate).quantize(Decimal("0.01"))
    if expected_tax <= 0:
        return Decimal("0.00")

    deviation = ((abs(transaction_obj.tax_amount - expected_tax) / expected_tax) * Decimal("100.00")).quantize(Decimal("0.01"))
    return deviation


def _create_alert_once(*, merchant, reason: str, severity: str) -> None:
    AIAlert.objects.get_or_create(
        merchant=merchant,
        reason=reason,
        resolved=False,
        defaults={"severity": severity},
    )


def evaluate_merchant_alerts(*, merchant, transaction_obj: "Transaction" | None = None) -> None:
    """Evaluate and persist merchant alerts based on requested risk conditions."""
    if merchant.role == merchant.Role.RRA:
        return

    if Decimal(merchant.fraud_risk_score or Decimal("0.00")) > HIGH_RISK_THRESHOLD:
        _create_alert_once(
            merchant=merchant,
            reason=AIAlert.Reason.HIGH_RISK_SCORE,
            severity=AIAlert.Severity.HIGH,
        )

    if merchant.compliance_grade == "D":
        _create_alert_once(
            merchant=merchant,
            reason=AIAlert.Reason.LOW_GRADE,
            severity=AIAlert.Severity.MEDIUM,
        )

    if transaction_obj and transaction_obj.status == type(transaction_obj).Status.COMPLETED:
        deviation = _compute_tax_deviation_percentage(transaction_obj=transaction_obj)
        if deviation > HIGH_TAX_DEVIATION_THRESHOLD:
            _create_alert_once(
                merchant=merchant,
                reason=AIAlert.Reason.HIGH_TAX_DEVIATION,
                severity=AIAlert.Severity.HIGH,
            )
