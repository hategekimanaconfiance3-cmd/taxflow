import { requireApprovedClearance } from '@/lib/auth-guard';
import { getSavedPaymentMethods } from '@/lib/actions/payment-method.action';
import { PaymentMethodManager } from '@/components/dashboard/payment-methods/payment-method-manager';
import { CreditCard } from 'lucide-react';

export default async function PaymentMethodsPage() {
  await requireApprovedClearance();
  const methods = await getSavedPaymentMethods();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          Payment Methods
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Save Mobile Money numbers and bank accounts to pay your taxes faster.
        </p>
      </div>
      <PaymentMethodManager initialMethods={methods} />
    </div>
  );
}
