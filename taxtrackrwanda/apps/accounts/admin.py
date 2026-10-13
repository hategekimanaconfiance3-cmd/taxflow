"""Accounts admin registrations."""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ("tin",)
    list_display = (
        "tin",
        "role",
        "phone_number",
        "is_tax_compliant",
        "total_tax_due",
        "total_tax_paid",
        "frozen_tax_amount",
        "compliance_score",
        "compliance_grade",
        "fraud_risk_score",
        "is_staff",
        "is_active",
    )
    search_fields = ("tin", "phone_number", "first_name", "last_name")

    fieldsets = (
        (None, {"fields": ("tin", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone_number", "role")}),
        (
            "Tax profile",
            {
                "fields": (
                    "is_tax_compliant",
                    "total_tax_due",
                    "total_tax_paid",
                    "frozen_tax_amount",
                    "compliance_score",
                    "compliance_grade",
                    "fraud_risk_score",
                )
            },
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined", "updated_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "tin",
                    "phone_number",
                    "role",
                    "password1",
                    "password2",
                    "is_tax_compliant",
                    "total_tax_due",
                    "total_tax_paid",
                    "frozen_tax_amount",
                    "compliance_score",
                    "compliance_grade",
                    "fraud_risk_score",
                    "is_active",
                    "is_staff",
                ),
            },
        ),
    )

    readonly_fields = ("date_joined", "updated_at")
