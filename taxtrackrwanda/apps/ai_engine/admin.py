"""Admin registrations for AI engine app."""
from django.contrib import admin

from .models import AIAlert


@admin.register(AIAlert)
class AIAlertAdmin(admin.ModelAdmin):
    list_display = ("merchant", "reason", "severity", "created_at", "resolved")
    list_filter = ("reason", "severity", "resolved", "created_at")
    search_fields = ("merchant__tin",)
