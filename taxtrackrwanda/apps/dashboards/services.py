"""Sales prediction services."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate

from apps.transactions.models import Transaction


VAT_RATE = Decimal("0.18")


@dataclass
class MerchantPrediction:
    merchant_id: int
    merchant_tin: str
    horizon_days: int
    predicted_sales_total: Decimal
    expected_vat_total: Decimal
    model: str
    data_points: int


def _linear_regression_coefficients(values: list[Decimal]) -> tuple[float, float]:
    """Return slope and intercept for simple linear regression y = m*x + b."""
    n = len(values)
    if n == 0:
        return 0.0, 0.0
    if n == 1:
        return 0.0, float(values[0])

    x_values = list(range(n))
    y_values = [float(v) for v in values]

    sum_x = float(sum(x_values))
    sum_y = float(sum(y_values))
    sum_x2 = float(sum(x * x for x in x_values))
    sum_xy = float(sum(x * y for x, y in zip(x_values, y_values, strict=True)))

    denominator = (n * sum_x2) - (sum_x * sum_x)
    if denominator == 0:
        return 0.0, sum_y / n

    slope = ((n * sum_xy) - (sum_x * sum_y)) / denominator
    intercept = (sum_y - (slope * sum_x)) / n
    return slope, intercept


def _predict_total(values: list[Decimal], horizon_days: int) -> Decimal:
    slope, intercept = _linear_regression_coefficients(values)
    n = len(values)
    future_sum = Decimal("0.00")

    for x in range(n, n + horizon_days):
        predicted = (slope * x) + intercept
        if predicted < 0:
            predicted = 0.0
        future_sum += Decimal(str(predicted))

    return future_sum.quantize(Decimal("0.01"))


def predict_sales_by_merchant(*, horizon_days: int = 30, seller_ids: Iterable[int] | None = None) -> list[MerchantPrediction]:
    amount_expr = ExpressionWrapper(F("selling_price") * F("quantity"), output_field=DecimalField(max_digits=20, decimal_places=2))
    queryset = Transaction.objects.filter(status=Transaction.Status.COMPLETED)
    if seller_ids is not None:
        queryset = queryset.filter(seller_id__in=list(seller_ids))

    daily_sales = (
        queryset.annotate(day=TruncDate("created_at"))
        .values("seller_id", "seller__tin", "day")
        .annotate(daily_total=Sum(amount_expr))
        .order_by("seller_id", "day")
    )

    merchant_history: dict[tuple[int, str], list[Decimal]] = {}
    for row in daily_sales:
        key = (row["seller_id"], row["seller__tin"])
        merchant_history.setdefault(key, []).append(row["daily_total"] or Decimal("0.00"))

    predictions: list[MerchantPrediction] = []
    for (merchant_id, merchant_tin), history in merchant_history.items():
        predicted_sales = _predict_total(history, horizon_days)
        expected_vat = (predicted_sales * VAT_RATE).quantize(Decimal("0.01"))
        predictions.append(
            MerchantPrediction(
                merchant_id=merchant_id,
                merchant_tin=merchant_tin,
                horizon_days=horizon_days,
                predicted_sales_total=predicted_sales,
                expected_vat_total=expected_vat,
                model="simple_linear_regression",
                data_points=len(history),
            )
        )

    predictions.sort(key=lambda item: item.merchant_id)
    return predictions
