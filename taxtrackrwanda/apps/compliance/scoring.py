"""AI-assisted compliance scoring utilities."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg

from apps.ai_engine.alerts import evaluate_merchant_alerts
from apps.compliance.models import TaxDispute, TaxPayment
from apps.compliance.services import compute_compliance_percentage


@dataclass
class ComplianceScoreBreakdown:
    score: Decimal
    grade: str
    tax_paid_percentage: Decimal
    payment_delay_days: Decimal
    disputes_count: int
    fraud_risk_score: Decimal


def _bounded(value: Decimal, low: Decimal = Decimal("0.00"), high: Decimal = Decimal("100.00")) -> Decimal:
    if value < low:
        return low
    if value > high:
        return high
    return value


def _grade_from_score(score: Decimal) -> str:
    if score >= Decimal("90.00"):
        return "A"
    if score >= Decimal("75.00"):
        return "B"
    if score >= Decimal("50.00"):
        return "C"
    return "D"


def calculate_compliance_score(*, user) -> ComplianceScoreBreakdown:
    tax_paid_percentage = compute_compliance_percentage(
        total_tax_due=user.total_tax_due,
        total_tax_paid=user.total_tax_paid,
        frozen_tax_amount=user.frozen_tax_amount,
    )

    payment_delay_days = TaxPayment.objects.filter(payer=user).aggregate(avg_delay=Avg("payment_delay_days"))["avg_delay"]
    payment_delay_days = Decimal(str(payment_delay_days or 0)).quantize(Decimal("0.01"))

    disputes_count = TaxDispute.objects.filter(transaction__seller=user).count()
    fraud_risk_score = _bounded(Decimal(user.fraud_risk_score or Decimal("0.00")))

    tax_component = _bounded(tax_paid_percentage)
    delay_component = _bounded(Decimal("100.00") - (payment_delay_days * Decimal("2.00")))
    dispute_component = _bounded(Decimal("100.00") - (Decimal(disputes_count) * Decimal("10.00")))
    fraud_component = _bounded(Decimal("100.00") - fraud_risk_score)

    score = (
        (tax_component * Decimal("0.40"))
        + (delay_component * Decimal("0.20"))
        + (dispute_component * Decimal("0.20"))
        + (fraud_component * Decimal("0.20"))
    ).quantize(Decimal("0.01"))
    grade = _grade_from_score(score)

    return ComplianceScoreBreakdown(
        score=score,
        grade=grade,
        tax_paid_percentage=tax_paid_percentage,
        payment_delay_days=payment_delay_days,
        disputes_count=disputes_count,
        fraud_risk_score=fraud_risk_score,
    )


def update_user_compliance_score(*, user_id: int) -> None:
    user_model = get_user_model()
    user = user_model.objects.get(pk=user_id)
    breakdown = calculate_compliance_score(user=user)
    user.compliance_score = breakdown.score
    user.compliance_grade = breakdown.grade
    user.save(update_fields=["compliance_score", "compliance_grade", "updated_at"])
    evaluate_merchant_alerts(merchant=user)


def update_all_user_compliance_scores() -> int:
    user_model = get_user_model()
    users = user_model.objects.filter(is_active=True).exclude(role=user_model.Role.RRA)
    count = 0
    for user in users.only("id"):
        update_user_compliance_score(user_id=user.id)
        count += 1
    return count
