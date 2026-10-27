"""Compliance admin registrations."""
from django.contrib import admin

from .models import DisputeAuditTrail, TaxAlert, TaxDispute, TaxPayment


@admin.register(TaxPayment)
class TaxPaymentAdmin(admin.ModelAdmin):
    list_display = ("payer", "amount", "is_late", "payment_delay_days", "created_at")
    search_fields = ("payer__tin",)
    list_filter = ("is_late", "created_at")


@admin.register(TaxAlert)
class TaxAlertAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "merchant",
        "transaction",
        "expected_tax",
        "actual_tax",
        "deviation_percentage",
        "threshold_percentage",
        "is_resolved",
        "created_at",
    )
    search_fields = ("merchant__tin", "transaction__id")
    list_filter = ("is_resolved", "created_at")


class DisputeAuditTrailInline(admin.TabularInline):
    model = DisputeAuditTrail
    extra = 0
    can_delete = False
    readonly_fields = ("action", "actor", "details", "created_at")


@admin.register(TaxDispute)
class TaxDisputeAdmin(admin.ModelAdmin):
    list_display = ("id", "transaction", "raised_by", "status", "disputed_tax_amount", "created_at", "expires_at")
    list_filter = ("status", "created_at", "expires_at")
    search_fields = ("transaction__id", "raised_by__tin", "transaction__seller__tin", "transaction__buyer__tin")
    readonly_fields = ("disputed_tax_amount", "created_at", "expires_at", "resolved_at")
    inlines = [DisputeAuditTrailInline]


@admin.register(DisputeAuditTrail)
class DisputeAuditTrailAdmin(admin.ModelAdmin):
    list_display = ("dispute", "action", "actor", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("dispute__id", "actor__tin")
    readonly_fields = ("dispute", "action", "actor", "details", "created_at")
