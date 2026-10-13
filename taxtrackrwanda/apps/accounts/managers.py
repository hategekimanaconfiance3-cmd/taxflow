"""Custom user manager for the accounts app."""
from __future__ import annotations

from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    """Manager for User model with TIN as username field."""

    use_in_migrations = True

    def _create_user(self, tin: str, phone_number: str, password: str | None, **extra_fields):
        role = extra_fields.get("role")
        if not tin:
            raise ValueError("The TIN must be set.")
        if not role:
            raise ValueError("The role must be set.")
        if not phone_number:
            raise ValueError("The phone number must be set.")

        tin = str(tin).strip()
        user = self.model(tin=tin, phone_number=phone_number, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, tin: str, phone_number: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("is_active", True)
        return self._create_user(tin=tin, phone_number=phone_number, password=password, **extra_fields)

    def create_superuser(self, tin: str, phone_number: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("role", "rra")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(tin=tin, phone_number=phone_number, password=password, **extra_fields)
