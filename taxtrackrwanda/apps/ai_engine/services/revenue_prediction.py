"""Revenue prediction service based on historical transactions."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate

from apps.transactions.models import Transaction


VAT_RATE = Decimal("0.18")


@dataclass
class MerchantRevenuePrediction:
    merchant_id: int
    merchant_tin: str
    predicted_sales_30d: Decimal
    predicted_vat_30d: Decimal
    data_points: int
    model: str = "linear_regression"


def _linear_regression_coefficients(values: list[Decimal]) -> tuple[float, float]:
    n = len(values)
    if n == 0:
        return 0.0, 0.0
    if n == 1:
        return 0.0, float(values[0])

    x_vals = list(range(n))
    y_vals = [float(v) for v in values]

    sum_x = float(sum(x_vals))
    sum_y = float(sum(y_vals))
    sum_x2 = float(sum(x * x for x in x_vals))
    sum_xy = float(sum(x * y for x, y in zip(x_vals, y_vals, strict=True)))

    denominator = (n * sum_x2) - (sum_x * sum_x)
    if denominator == 0:
        return 0.0, sum_y / n

    slope = ((n * sum_xy) - (sum_x * sum_y)) / denominator
    intercept = (sum_y - (slope * sum_x)) / n
    return slope, intercept


def _predict_total(values: list[Decimal], horizon_days: int) -> Decimal:
    slope, intercept = _linear_regression_coefficients(values)
    n = len(values)
    total = Decimal("0.00")

    for x in range(n, n + horizon_days):
        forecast = (slope * x) + intercept
        if forecast < 0:
            forecast = 0.0
        total += Decimal(str(forecast))

    return total.quantize(Decimal("0.01"))


def predict_next_30_days_revenue() -> list[MerchantRevenuePrediction]:
    amount_expr = ExpressionWrapper(F("selling_price") * F("quantity"), output_field=DecimalField(max_digits=20, decimal_places=2))

    daily_sales = (
        Transaction.objects.filter(status=Transaction.Status.COMPLETED)
        .annotate(day=TruncDate("created_at"))
        .values("seller_id", "seller__tin", "day")
        .annotate(daily_total=Sum(amount_expr))
        .order_by("seller_id", "day")
    )

    merchant_history: dict[tuple[int, str], list[Decimal]] = {}
    for row in daily_sales:
        key = (row["seller_id"], row["seller__tin"])
        merchant_history.setdefault(key, []).append(row["daily_total"] or Decimal("0.00"))

    results: list[MerchantRevenuePrediction] = []
    for (merchant_id, merchant_tin), values in merchant_history.items():
        predicted_sales = _predict_total(values, horizon_days=30)
        predicted_vat = (predicted_sales * VAT_RATE).quantize(Decimal("0.01"))
        results.append(
            MerchantRevenuePrediction(
                merchant_id=merchant_id,
                merchant_tin=merchant_tin,
                predicted_sales_30d=predicted_sales,
                predicted_vat_30d=predicted_vat,
                data_points=len(values),
            )
        )

    results.sort(key=lambda item: item.merchant_id)
    return results


class RevenuePredictionService:
    """Entry point for revenue forecasting workflows."""

    def predict(self) -> list[MerchantRevenuePrediction]:
        return predict_next_30_days_revenue()
