"""Compliance API URLs."""
from rest_framework.routers import DefaultRouter

from .views import TaxAlertViewSet, TaxDisputeViewSet

router = DefaultRouter()
router.register(r"disputes", TaxDisputeViewSet, basename="tax-dispute")
router.register(r"alerts", TaxAlertViewSet, basename="tax-alert")

urlpatterns = router.urls
