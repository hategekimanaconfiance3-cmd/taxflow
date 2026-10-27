"""Transactions admin registrations."""
from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "seller",
        "buyer",
        "product",
        "quantity",
        "purchase_price",
        "selling_price",
        "tax_amount",
        "status",
        "created_at",
    )
    search_fields = ("seller__tin", "buyer__tin", "product__name")
    list_filter = ("status", "created_at")
