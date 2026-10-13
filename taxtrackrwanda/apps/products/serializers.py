"""Serializers for products APIs."""
from rest_framework import serializers

from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "description",
            "created_by",
            "base_price",
            "tax_rate",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "created_at")

    def validate(self, attrs):
        request = self.context.get("request")
        if request and request.method == "POST" and getattr(request.user, "role", None) != "factory":
            raise serializers.ValidationError("Only users with the factory role can create products.")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["created_by"] = request.user
        return super().create(validated_data)
