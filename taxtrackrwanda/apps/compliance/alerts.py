"""Real-time AI alert engine for tax deviation monitoring."""
from __future__ import annotations

from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum

from apps.compliance.models import TaxAlert
from apps.transactions.models import Transaction

DEFAULT_EXPECTED_RATE = Decimal("0.18")
ALERT_DEVIATION_THRESHOLD = Decimal("30.00")


def _historical_expected_tax_rate(*, seller_id: int) -> Decimal:
    amount_expr = ExpressionWrapper(F("selling_price") * F("quantity"), output_field=DecimalField(max_digits=20, decimal_places=2))
    aggregates = (
        Transaction.objects.filter(status=Transaction.Status.COMPLETED, seller_id=seller_id)
        .aggregate(total_amount=Sum(amount_expr), total_tax=Sum("tax_amount"))
    )

    total_amount = aggregates["total_amount"] or Decimal("0.00")
    total_tax = aggregates["total_tax"] or Decimal("0.00")

    if total_amount <= 0:
        return DEFAULT_EXPECTED_RATE

    expected_rate = (total_tax / total_amount).quantize(Decimal("0.0001"))
    if expected_rate <= 0:
        return DEFAULT_EXPECTED_RATE
    return expected_rate


def evaluate_transaction_tax_alert(*, transaction_obj: Transaction) -> TaxAlert | None:
    if transaction_obj.status != Transaction.Status.COMPLETED:
        return None

    expected_rate = _historical_expected_tax_rate(seller_id=transaction_obj.seller_id)
    amount = (transaction_obj.selling_price * transaction_obj.quantity).quantize(Decimal("0.01"))
    expected_tax = (amount * expected_rate).quantize(Decimal("0.01"))
    actual_tax = transaction_obj.tax_amount

    if expected_tax <= 0:
        return None

    deviation_percentage = ((abs(actual_tax - expected_tax) / expected_tax) * Decimal("100.00")).quantize(Decimal("0.01"))

    if deviation_percentage <= ALERT_DEVIATION_THRESHOLD:
        return None

    alert, _ = TaxAlert.objects.update_or_create(
        transaction=transaction_obj,
        defaults={
            "merchant": transaction_obj.seller,
            "expected_tax": expected_tax,
            "actual_tax": actual_tax,
            "deviation_percentage": deviation_percentage,
            "threshold_percentage": ALERT_DEVIATION_THRESHOLD,
            "message": f"Tax deviation {deviation_percentage}% exceeds threshold {ALERT_DEVIATION_THRESHOLD}%",
        },
    )
    return alert
