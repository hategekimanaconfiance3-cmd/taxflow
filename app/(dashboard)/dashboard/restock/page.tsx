import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { ClipboardList, Info } from "lucide-react";
import { requireApprovedClearance, requireTraderSession } from "@/lib/auth-guard";
import db from "@/db/drizzle";
import { product, stock, stockRestockRequest } from "@/db/schema";
import { RestockRequestForm } from "@/components/stock-control/forms";

const RESULT_MESSAGES: Record<string, { tone: string; text: string }> = {
  eligible: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The request passed the active recorded sell-through check. This result does not create a supplier order, goods receipt, inventory movement, or VAT posting." },
  blocked: { tone: "border-amber-300 bg-amber-50 text-amber-900", text: "The recorded sales are below the active threshold, so this request did not pass the eligibility check." },
  review_required: { tone: "border-amber-300 bg-amber-50 text-amber-900", text: "TaxFlow could not verify this stock cohort. An authorized stock officer must review the recorded balance or evidence." },
  exception_pending: { tone: "border-blue-300 bg-blue-50 text-blue-900", text: "Your exception request was recorded and is awaiting an authorized officer’s decision." },
  invalid: { tone: "border-red-300 bg-red-50 text-red-800", text: "The request details were invalid. Check the product, quantity, and exception reason." },
  error: { tone: "border-red-300 bg-red-50 text-red-800", text: "TaxFlow could not save the request. No inventory or tax records were changed." },
  schema: { tone: "border-red-300 bg-red-50 text-red-800", text: "Restock request storage is not available. An administrator must check the database migration. No inventory or tax records were changed." },
  product_not_held: { tone: "border-red-300 bg-red-50 text-red-800", text: "Restock requests are limited to products already recorded in your business stock. No inventory or tax records were changed." },
  clearance: { tone: "border-red-300 bg-red-50 text-red-800", text: "Your business account must have approved clearance to submit a restock request." },
};

export const dynamic = "force-dynamic";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export default async function RestockRequestsPage({ searchParams }: { searchParams: Promise<{ result?: string; reference?: string }> }) {
  await requireTraderSession(["manufacturer"]);
  const { user, suspended } = await requireApprovedClearance();
  const params = await searchParams;
  const notice = params.result ? RESULT_MESSAGES[params.result] : undefined;
  const [products, requests] = await Promise.all([
    db.selectDistinct({ id: product.id, name: product.name, unit: product.unit, categoryCode: product.categoryCode })
      .from(product).innerJoin(stock, and(eq(stock.productId, product.id), eq(stock.businessId, user.id)))
      .orderBy(product.name).limit(200),
    db.select({
      id: stockRestockRequest.id,
      cycleStartedAt: stockRestockRequest.cycleStartedAt,
      productName: product.name,
      productUnit: product.unit,
      requestedQuantity: stockRestockRequest.requestedQuantity,
      thresholdPercent: stockRestockRequest.thresholdPercent,
      cohortQuantity: stockRestockRequest.cohortQuantity,
      qualifyingSalesQuantity: stockRestockRequest.qualifyingSalesQuantity,
      requiredSalesQuantity: stockRestockRequest.requiredSalesQuantity,
      sellThroughPercent: stockRestockRequest.sellThroughPercent,
      eligibilityStatus: stockRestockRequest.eligibilityStatus,
      eligibilityReason: stockRestockRequest.eligibilityReason,
      exceptionStatus: stockRestockRequest.exceptionStatus,
      exceptionReason: stockRestockRequest.exceptionReason,
      reviewedAt: stockRestockRequest.reviewedAt,
      reviewReason: stockRestockRequest.reviewReason,
      createdAt: stockRestockRequest.createdAt,
    }).from(stockRestockRequest)
      .innerJoin(product, eq(stockRestockRequest.productId, product.id))
      .where(eq(stockRestockRequest.businessId, user.id))
      .orderBy(desc(stockRestockRequest.createdAt)).limit(10),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Restock Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check recorded sell-through eligibility and record a restock request.</p>
      </header>

      {notice && <div className={`rounded-md border p-3 text-sm ${notice.tone}`} role="status">
        {notice.text}
        {params.reference && /^[0-9a-f-]{36}$/i.test(params.reference) && <span className="mt-1 block text-xs">Support reference: {params.reference}</span>}
      </div>}

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Check eligibility</h2>
        </div>
        <div className="mb-5 flex gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>The check uses TaxFlow’s recorded stock ledger. A successful request only records eligibility; it does not create an order, receipt, stock movement, or VAT posting. Requests are available only for products already recorded in your business stock. Production, imports, and accepted B2B receipts continue through their existing workflows.</p>
        </div>
        {suspended ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Your business account must have approved clearance before you can submit a request.</p>
        ) : products.length > 0 ? (
          <RestockRequestForm products={products} idempotencyKey={randomUUID()} />
        ) : (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No TaxFlow products are available yet.</p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Your recent requests</h2>
        </div>
        {requests.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">You have not submitted a restock request.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{request.productName}</h3>
                    <p className="text-sm text-muted-foreground">Requested {request.requestedQuantity.toLocaleString()} {request.productUnit} · {request.createdAt.toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded-full bg-muted px-2.5 py-1">Eligibility: {statusLabel(request.eligibilityStatus)}</span>
                    {request.exceptionStatus !== "none" && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">Exception {statusLabel(request.exceptionStatus)}</span>}
                  </div>
                </div>
                <p className="mt-2 text-sm">{request.eligibilityReason}</p>
                {request.eligibilityStatus !== "review_required" && request.thresholdPercent !== null && <p className="mt-1 text-sm text-muted-foreground">Recorded sales: {request.qualifyingSalesQuantity.toLocaleString()} of {request.cohortQuantity.toLocaleString()} cohort units; {request.requiredSalesQuantity.toLocaleString()} sales required at the {request.thresholdPercent}% threshold{request.sellThroughPercent === null ? "" : ` (${request.sellThroughPercent.toFixed(1)}% recorded sell-through)`}.</p>}
                <p className="mt-1 text-xs text-muted-foreground">Calculation cohort began {request.cycleStartedAt.toLocaleString()}.</p>
                {request.exceptionReason && <p className="mt-2 text-sm text-muted-foreground">Exception reason: {request.exceptionReason}</p>}
                {request.reviewReason && <p className="mt-2 text-sm text-muted-foreground">Officer response{request.reviewedAt ? ` · ${request.reviewedAt.toLocaleString()}` : ""}: {request.reviewReason}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
