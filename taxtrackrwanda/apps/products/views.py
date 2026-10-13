"""API views for products."""
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Product
from .permissions import IsFactoryForCreate
from .serializers import ProductSerializer


class ProductViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Product.objects.select_related("created_by").all()
    serializer_class = ProductSerializer
    permission_classes = (IsAuthenticated, IsFactoryForCreate)
