"""Compliance serializers."""
from rest_framework import serializers

from .models import DisputeAuditTrail, TaxAlert, TaxDispute


class DisputeAuditTrailSerializer(serializers.ModelSerializer):
    actor_tin = serializers.CharField(source="actor.tin", read_only=True)

    class Meta:
        model = DisputeAuditTrail
        fields = ("id", "action", "actor_tin", "details", "created_at")


class TaxDisputeSerializer(serializers.ModelSerializer):
    audit_trail = DisputeAuditTrailSerializer(many=True, read_only=True)

    class Meta:
        model = TaxDispute
        fields = (
            "id",
            "transaction",
            "raised_by",
            "reason",
            "evidence",
            "disputed_tax_amount",
            "status",
            "created_at",
            "expires_at",
            "resolved_at",
            "audit_trail",
        )
        read_only_fields = (
            "disputed_tax_amount",
            "status",
            "created_at",
            "expires_at",
            "resolved_at",
            "audit_trail",
            "raised_by",
        )

    def create(self, validated_data):
        validated_data["raised_by"] = self.context["request"].user
        return super().create(validated_data)


class ResolveTaxDisputeSerializer(serializers.Serializer):
    uphold = serializers.BooleanField()
    notes = serializers.CharField(required=False, allow_blank=True)


class TaxAlertSerializer(serializers.ModelSerializer):
    merchant_tin = serializers.CharField(source="merchant.tin", read_only=True)

    class Meta:
        model = TaxAlert
        fields = (
            "id",
            "transaction",
            "merchant",
            "merchant_tin",
            "expected_tax",
            "actual_tax",
            "deviation_percentage",
            "threshold_percentage",
            "message",
            "is_resolved",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
