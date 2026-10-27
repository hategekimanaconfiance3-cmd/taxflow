"""Permissions for AI engine APIs."""
from rest_framework.permissions import BasePermission


class IsRRAUser(BasePermission):
    """Allow only authenticated RRA users."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == user.Role.RRA)
