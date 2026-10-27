"""Compliance permissions."""
from rest_framework.permissions import BasePermission


class IsDisputeParticipantOrRRA(BasePermission):
    """Allow access to dispute participants and RRA users."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == user.Role.RRA:
            return True
        return user.id in {obj.transaction.seller_id, obj.transaction.buyer_id}


class IsRRAUser(BasePermission):
    """Allow access only to authenticated RRA users."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == user.Role.RRA)
