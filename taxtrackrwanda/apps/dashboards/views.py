"""Dashboards API views."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import MerchantSalesPredictionSerializer, SalesPredictionQuerySerializer
from .services import predict_sales_by_merchant


class SalesPredictionView(APIView):
    """Predict next-N day sales and VAT revenue per merchant."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        query_serializer = SalesPredictionQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        horizon_days = query_serializer.validated_data["days"]

        if request.user.role == request.user.Role.RRA:
            seller_ids = None
        else:
            seller_ids = [request.user.id]

        predictions = predict_sales_by_merchant(horizon_days=horizon_days, seller_ids=seller_ids)
        serializer = MerchantSalesPredictionSerializer(predictions, many=True)
        return Response(
            {
                "horizon_days": horizon_days,
                "merchant_count": len(serializer.data),
                "predictions": serializer.data,
            }
        )
