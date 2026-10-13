"""Recalculate compliance scores for all merchants."""
from django.core.management.base import BaseCommand

from apps.compliance.scoring import update_all_user_compliance_scores


class Command(BaseCommand):
    help = "Recalculate compliance_score and compliance_grade for all active non-RRA users."

    def handle(self, *args, **options):
        processed = update_all_user_compliance_scores()
        self.stdout.write(self.style.SUCCESS(f"Updated compliance scores for {processed} users."))
