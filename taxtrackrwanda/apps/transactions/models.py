"""Transactions domain models."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F

from apps.ai_engine.alerts import evaluate_merchant_alerts
from apps.compliance.alerts import evaluate_transaction_tax_alert
from apps.compliance.services import is_tax_compliant
from apps.products.models import Inventory, Product


class Transaction(models.Model):
    """Represents a product sale from one user to another and updates inventory."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        BLOCKED = "blocked", "Blocked"

    VAT_RATE = Decimal("0.18")

    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchases")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="transactions")
    quantity = models.PositiveIntegerField()
    purchase_price = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=18, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0.00"), editable=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})
        if self.selling_price <= 0:
            raise ValidationError({"selling_price": "Selling price must be greater than zero."})
        if self.seller_id and self.buyer_id and self.seller_id == self.buyer_id:
            raise ValidationError({"buyer": "Buyer must be different from seller."})

        if self.buyer_id:
            buyer_compliant = is_tax_compliant(
                total_tax_due=self.buyer.total_tax_due,
                total_tax_paid=self.buyer.total_tax_paid,
                frozen_tax_amount=self.buyer.frozen_tax_amount,
            )
            if not buyer_compliant:
                self.status = self.Status.BLOCKED

        if self.status == self.Status.COMPLETED and self.purchase_price is None:
            self.purchase_price = self.selling_price

    def save(self, *args, **kwargs):
        is_create = self._state.adding
        previous = None
        if not is_create:
            previous = type(self).objects.filter(pk=self.pk).first()

        self.tax_amount = (self.selling_price * self.quantity * self.VAT_RATE).quantize(Decimal("0.01"))
        self.full_clean()

        with transaction.atomic():
            if is_create:
                if self.status == self.Status.COMPLETED:
                    self.purchase_price = self.selling_price
                    self._apply_inventory_movement()
                    self._apply_seller_tax_due()
            else:
                if previous and previous.status != self.Status.PENDING and self.selling_price != previous.selling_price:
                    raise ValidationError({"selling_price": "Selling price can only be edited while transaction is pending."})
                if previous and previous.purchase_price is not None and self.purchase_price != previous.purchase_price:
                    raise ValidationError({"purchase_price": "Purchase price is locked and cannot be edited."})
                if previous and previous.status == self.Status.PENDING and self.status == self.Status.COMPLETED:
                    self.purchase_price = self.selling_price
                    self._apply_inventory_movement()
                    self._apply_seller_tax_due()

            saved = super().save(*args, **kwargs)

        if self.status == self.Status.COMPLETED:
            transaction.on_commit(lambda: evaluate_transaction_tax_alert(transaction_obj=self))
            transaction.on_commit(lambda: evaluate_merchant_alerts(merchant=self.seller, transaction_obj=self))

        return saved

    def complete(self, *, actor):
        """Complete a pending transaction; only seller can perform this action."""
        if actor != self.seller:
            raise ValidationError("Only seller can complete this transaction.")
        if self.status != self.Status.PENDING:
            raise ValidationError("Only pending transactions can be completed.")
        self.status = self.Status.COMPLETED
        self.save(update_fields=["status", "purchase_price", "tax_amount"])

    def set_selling_price(self, *, actor, new_selling_price: Decimal):
        """Allow seller to edit selling price only before the sale is completed."""
        if self.status != self.Status.PENDING:
            raise ValidationError("Selling price can only be edited before sale completion.")
        if actor != self.seller:
            raise ValidationError("Only the seller can edit selling price.")
        if new_selling_price <= 0:
            raise ValidationError("Selling price must be greater than zero.")
        self.selling_price = new_selling_price
        self.save(update_fields=["selling_price", "tax_amount"])

    def _apply_seller_tax_due(self):
        user_model = type(self.seller)
        user_model.objects.filter(pk=self.seller_id).update(total_tax_due=F("total_tax_due") + self.tax_amount)
        seller = user_model.objects.select_for_update().get(pk=self.seller_id)
        seller.is_tax_compliant = is_tax_compliant(
            total_tax_due=seller.total_tax_due,
            total_tax_paid=seller.total_tax_paid,
            frozen_tax_amount=seller.frozen_tax_amount,
        )
        seller.save(update_fields=["is_tax_compliant", "updated_at"])

        from apps.compliance.scoring import update_user_compliance_score

        update_user_compliance_score(user_id=self.seller_id)

    def _apply_inventory_movement(self):
        seller_inventory = (
            Inventory.objects.select_for_update()
            .select_related("owner", "product")
            .filter(owner=self.seller, product=self.product)
            .first()
        )
        if seller_inventory is None:
            raise ValidationError({"seller": "Seller has no inventory for this product."})
        if seller_inventory.quantity < self.quantity:
            raise ValidationError({"quantity": "Insufficient stock for this transaction."})

        updated = Inventory.objects.filter(pk=seller_inventory.pk, quantity__gte=self.quantity).update(
            quantity=F("quantity") - self.quantity
        )
        if updated == 0:
            raise ValidationError({"quantity": "Insufficient stock for this transaction."})

        buyer_inventory, _ = Inventory.objects.select_for_update().get_or_create(
            owner=self.buyer,
            product=self.product,
            defaults={"quantity": 0, "locked_purchase_price": self.purchase_price},
        )
        Inventory.objects.filter(pk=buyer_inventory.pk).update(
            quantity=F("quantity") + self.quantity,
            locked_purchase_price=self.purchase_price,
        )

    def __str__(self) -> str:
        return f"{self.seller} -> {self.buyer} ({self.product}, qty={self.quantity})"
