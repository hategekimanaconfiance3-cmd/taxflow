import { requireTraderSession } from "@/lib/auth-guard";
import { getMyTaxpayerCorrectionRequests } from "@/lib/actions/taxpayer-correction.action";
import { TaxpayerCorrectionRequests } from "@/components/dashboard/taxpayer-correction-requests";

export const metadata = { title: "Correction Requests · TaxFlow" };

export default async function TaxpayerCorrectionsPage() {
  await requireTraderSession();
  const requests = await getMyTaxpayerCorrectionRequests();
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><header><h1 className="text-2xl font-bold">Taxpayer Correction Requests</h1><p className="mt-1 text-sm text-muted-foreground">Request a review of eligible profile information. Submitting a request will not change your official account record.</p></header><TaxpayerCorrectionRequests initialRequests={requests} /></main>;
}
