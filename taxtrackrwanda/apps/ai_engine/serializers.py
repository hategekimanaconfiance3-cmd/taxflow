"""Serializers for AI engine APIs."""
from rest_framework import serializers

from .models import AIAlert


class RevenuePredictionSerializer(serializers.Serializer):
    merchant_id = serializers.IntegerField()
    merchant_tin = serializers.CharField()
    predicted_sales_30d = serializers.DecimalField(max_digits=20, decimal_places=2)
    predicted_vat_30d = serializers.DecimalField(max_digits=20, decimal_places=2)
    data_points = serializers.IntegerField()
    model = serializers.CharField()


class AIAlertSerializer(serializers.ModelSerializer):
    merchant_tin = serializers.CharField(source="merchant.tin", read_only=True)

    class Meta:
        model = AIAlert
        fields = ("id", "merchant", "merchant_tin", "reason", "severity", "created_at", "resolved")
        read_only_fields = fields
