"""Compliance API views."""
from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import TaxAlert, TaxDispute
from .permissions import IsDisputeParticipantOrRRA, IsRRAUser
from .serializers import ResolveTaxDisputeSerializer, TaxAlertSerializer, TaxDisputeSerializer


class TaxDisputeViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Create and review tax disputes."""

    serializer_class = TaxDisputeSerializer
    permission_classes = (IsAuthenticated, IsDisputeParticipantOrRRA)

    def get_queryset(self):
        user = self.request.user
        base_qs = TaxDispute.objects.select_related("transaction", "raised_by")
        if user.role == user.Role.RRA:
            return base_qs
        return base_qs.filter(Q(transaction__seller=user) | Q(transaction__buyer=user)).distinct()

    def perform_create(self, serializer):
        serializer.save(raised_by=self.request.user)

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action in {"retrieve", "resolve"}:
            permissions.append(IsDisputeParticipantOrRRA())
        return permissions

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        dispute = self.get_object()
        serializer = ResolveTaxDisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dispute.resolve(
            actor=request.user,
            uphold=serializer.validated_data["uphold"],
            notes=serializer.validated_data.get("notes", ""),
        )
        response_serializer = self.get_serializer(dispute)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class TaxAlertViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """RRA dashboard endpoint for AI-generated tax alerts."""

    serializer_class = TaxAlertSerializer
    permission_classes = (IsAuthenticated, IsRRAUser)

    def get_queryset(self):
        queryset = TaxAlert.objects.select_related("merchant", "transaction")

        merchant_tin = self.request.query_params.get("merchant_tin")
        if merchant_tin:
            queryset = queryset.filter(merchant__tin=merchant_tin)

        is_resolved = self.request.query_params.get("is_resolved")
        if is_resolved is not None:
            if is_resolved.lower() in {"true", "1"}:
                queryset = queryset.filter(is_resolved=True)
            elif is_resolved.lower() in {"false", "0"}:
                queryset = queryset.filter(is_resolved=False)

        start_date = self.request.query_params.get("start_date")
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)

        end_date = self.request.query_params.get("end_date")
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)

        return queryset
