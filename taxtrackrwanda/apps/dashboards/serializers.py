"""Dashboards serializers."""
from rest_framework import serializers


class SalesPredictionQuerySerializer(serializers.Serializer):
    days = serializers.IntegerField(required=False, min_value=1, max_value=365, default=30)


class MerchantSalesPredictionSerializer(serializers.Serializer):
    merchant_id = serializers.IntegerField()
    merchant_tin = serializers.CharField()
    horizon_days = serializers.IntegerField()
    predicted_sales_total = serializers.DecimalField(max_digits=20, decimal_places=2)
    expected_vat_total = serializers.DecimalField(max_digits=20, decimal_places=2)
    model = serializers.CharField()
    data_points = serializers.IntegerField()
