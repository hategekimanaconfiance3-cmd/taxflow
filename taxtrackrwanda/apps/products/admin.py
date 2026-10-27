"""Products admin registrations."""
from django.contrib import admin

from .models import Inventory, Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "base_price", "tax_rate", "created_at")
    search_fields = ("name", "description", "created_by__tin")
    list_filter = ("tax_rate", "created_at")


@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ("owner", "product", "quantity", "locked_purchase_price", "updated_at")
    search_fields = ("owner__tin", "product__name")
    list_filter = ("updated_at",)
