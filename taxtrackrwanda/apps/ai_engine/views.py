"""API views for AI engine app."""
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AIAlert
from .permissions import IsRRAUser
from .serializers import AIAlertSerializer, RevenuePredictionSerializer
from .services.revenue_prediction import RevenuePredictionService


class RRARevenuePredictionView(APIView):
    """Return merchant sales/VAT predictions for the next 30 days (RRA only)."""

    permission_classes = (IsAuthenticated, IsRRAUser)

    def get(self, request):
        predictions = RevenuePredictionService().predict()
        serializer = RevenuePredictionSerializer(predictions, many=True)
        return Response(
            {
                "horizon_days": 30,
                "merchant_count": len(serializer.data),
                "predictions": serializer.data,
            }
        )


class RRAAlertDashboardView(ListAPIView):
    """RRA dashboard endpoint to view AI alerts."""

    serializer_class = AIAlertSerializer
    permission_classes = (IsAuthenticated, IsRRAUser)

    def get_queryset(self):
        queryset = AIAlert.objects.select_related("merchant")

        resolved = self.request.query_params.get("resolved")
        if resolved is not None:
            if resolved.lower() in {"true", "1"}:
                queryset = queryset.filter(resolved=True)
            elif resolved.lower() in {"false", "0"}:
                queryset = queryset.filter(resolved=False)

        reason = self.request.query_params.get("reason")
        if reason:
            queryset = queryset.filter(reason=reason)

        severity = self.request.query_params.get("severity")
        if severity:
            queryset = queryset.filter(severity=severity)

        return queryset
