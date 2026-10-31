import { notFound } from "next/navigation";
import { requireRRAPermission } from "@/lib/auth-guard";
import { getAssignedCorrectionRequest } from "@/lib/actions/taxpayer-correction.action";
import { TaxpayerCorrectionReview } from "@/components/admin/taxpayer-correction-review";

export const metadata = { title: "Correction Request Review · TaxFlow" };

export default async function TaxpayerCorrectionReviewPage({ params }: { params: Promise<{ requestId: string }> }) {
  await requireRRAPermission("taxpayer.correction.read_assigned");
  const { requestId } = await params;
  let correction: Awaited<ReturnType<typeof getAssignedCorrectionRequest>>;
  try {
    correction = await getAssignedCorrectionRequest(requestId);
  } catch {
    notFound();
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><TaxpayerCorrectionReview correction={correction} /></main>;
}
