"""Alert service for AI engine."""
from __future__ import annotations

from apps.ai_engine.alerts import evaluate_merchant_alerts


class AlertEngineService:
    """Entry point for AI-driven alerting workflows."""

    def evaluate(self, *, merchant, transaction_obj=None) -> None:
        evaluate_merchant_alerts(merchant=merchant, transaction_obj=transaction_obj)
