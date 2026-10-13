"""Custom permissions for products APIs."""
from rest_framework.permissions import BasePermission


class IsFactoryForCreate(BasePermission):
    """Allow product creation only to authenticated users with factory role."""

    message = "Only users with the factory role can create products."

    def has_permission(self, request, view):
        if request.method in ("POST",):
            return bool(request.user and request.user.is_authenticated and getattr(request.user, "role", None) == "factory")
        return bool(request.user and request.user.is_authenticated)
