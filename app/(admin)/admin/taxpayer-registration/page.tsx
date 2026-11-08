import { RegisterTaxpayerDialog } from "@/components/admin/register-taxpayer-dialog";
import { requireRRAPermission } from "@/lib/auth-guard";

export default async function TaxpayerRegistrationPage() {
  await requireRRAPermission("taxpayer.registration.create");

  return (
    <main className="space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Taxpayer Registration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register a taxpayer using verified registration details.
        </p>
      </header>
      <section className="rounded-lg border bg-card p-5">
        <RegisterTaxpayerDialog />
      </section>
    </main>
  );
}
