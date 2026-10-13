"""Dashboards API URLs."""
from django.urls import path

from .views import SalesPredictionView

urlpatterns = [
    path("sales-predictions/", SalesPredictionView.as_view(), name="sales-predictions"),
]
