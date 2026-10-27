"""URLs for AI engine APIs."""
from django.urls import path

from .views import RRAAlertDashboardView, RRARevenuePredictionView

urlpatterns = [
    path("rra/predictions/", RRARevenuePredictionView.as_view(), name="rra-predictions"),
    path("rra/alerts/", RRAAlertDashboardView.as_view(), name="rra-alerts"),
]
