"""Compliance service helpers."""
from __future__ import annotations

from decimal import Decimal


COMPLIANCE_THRESHOLD = Decimal("0.05")


def compute_unpaid_tax(*, total_tax_due: Decimal, total_tax_paid: Decimal, frozen_tax_amount: Decimal = Decimal("0.00")) -> Decimal:
    effective_due = (total_tax_due or Decimal("0.00")) - (frozen_tax_amount or Decimal("0.00"))
    if effective_due < 0:
        effective_due = Decimal("0.00")
    unpaid = effective_due - (total_tax_paid or Decimal("0.00"))
    return unpaid if unpaid > 0 else Decimal("0.00")


def compute_compliance_percentage(
    *, total_tax_due: Decimal, total_tax_paid: Decimal, frozen_tax_amount: Decimal = Decimal("0.00")
) -> Decimal:
    effective_due = (total_tax_due or Decimal("0.00")) - (frozen_tax_amount or Decimal("0.00"))
    if effective_due <= 0:
        return Decimal("100.00")

    paid_ratio = (total_tax_paid / effective_due) * Decimal("100")
    if paid_ratio < 0:
        return Decimal("0.00")
    if paid_ratio > 100:
        return Decimal("100.00")
    return paid_ratio.quantize(Decimal("0.01"))


def is_tax_compliant(*, total_tax_due: Decimal, total_tax_paid: Decimal, frozen_tax_amount: Decimal = Decimal("0.00")) -> bool:
    effective_due = (total_tax_due or Decimal("0.00")) - (frozen_tax_amount or Decimal("0.00"))
    if effective_due <= 0:
        return True

    unpaid = compute_unpaid_tax(
        total_tax_due=total_tax_due,
        total_tax_paid=total_tax_paid,
        frozen_tax_amount=frozen_tax_amount,
    )
    return unpaid < (effective_due * COMPLIANCE_THRESHOLD)
