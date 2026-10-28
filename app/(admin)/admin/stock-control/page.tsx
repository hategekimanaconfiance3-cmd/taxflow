import { and, asc, count, desc, eq, inArray, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ClipboardList, Package, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { requireRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import db from "@/db/drizzle";
import { product, stockRestockRequest, stockSellThroughCycle, stockSellThroughThreshold, user } from "@/db/schema";
import { BaselineAttestationForm, RestockExceptionReviewForm, SellThroughThresholdForm } from "@/components/stock-control/forms";

const PAGE_SIZE = 25;
const FILTERS = ["all", "pending_exception", "blocked", "review_required", "eligible"] as const;

const RESULT_MESSAGES: Record<string, { tone: string; text: string }> = {
  threshold_saved: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The threshold revision was recorded and audited." },
  baseline_attested: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The current recorded balance was attested as a prospective TaxFlow baseline. This does not independently verify physical stock." },
  review_saved: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The exception decision was recorded and audited." },
  invalid: { tone: "border-red-300 bg-red-50 text-red-800", text: "The submitted values were invalid. Please review the form and try again." },
  unauthorized: { tone: "border-red-300 bg-red-50 text-red-800", text: "Your assigned role does not permit that threshold scope." },
  effective_date: { tone: "border-red-300 bg-red-50 text-red-800", text: "Thresholds must take effect now or in the future. Past decisions are not rewritten." },
  scope_not_found: { tone: "border-red-300 bg-red-50 text-red-800", text: "That product or category is not available in TaxFlow." },
  self_review: { tone: "border-red-300 bg-red-50 text-red-800", text: "The person who requested an exception cannot review that request." },
  review_error: { tone: "border-red-300 bg-red-50 text-red-800", text: "The exception decision could not be saved. Refresh and verify the request status." },
  attestation_error: { tone: "border-red-300 bg-red-50 text-red-800", text: "The balance attestation could not be saved." },
  missing_stock: { tone: "border-red-300 bg-red-50 text-red-800", text: "The stock row is missing while movement history exists; the balance cannot be attested through this workflow." },
  active_reservation: { tone: "border-amber-300 bg-amber-50 text-amber-900", text: "An active seller reservation must be resolved through its transaction workflow before resetting this stock cohort." },
  error: { tone: "border-red-300 bg-red-50 text-red-800", text: "The requested change could not be saved." },
};

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function getFilterCondition(filter: string) {
  switch (filter) {
    case "pending_exception": return eq(stockRestockRequest.exceptionStatus, "pending");
    case "blocked": return eq(stockRestockRequest.eligibilityStatus, "blocked");
    case "review_required": return eq(stockRestockRequest.eligibilityStatus, "review_required");
    case "eligible": return eq(stockRestockRequest.eligibilityStatus, "eligible");
    default: return undefined;
  }
}

export default async function AdminStockControlPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; result?: string }>;
}) {
  const { staff } = await requireRRAPermission("stock.restock.read");
  const params = await searchParams;
  const filter = FILTERS.includes(params.status as typeof FILTERS[number]) ? params.status! : "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10_000)) : 1;
  const now = new Date();
  const condition = getFilterCondition(filter);
  const business = alias(user, "stock_restock_business");
  const requester = alias(user, "stock_restock_requester");
  const reviewer = alias(user, "stock_restock_reviewer");
  const thresholdActor = alias(user, "stock_threshold_actor");
  const canManageGlobal = staff.clearanceRoles.some((role) => hasRRAPermission(role, "stock.threshold.manage.global"));
  const canManageScoped = staff.clearanceRoles.some((role) => hasRRAPermission(role, "stock.threshold.manage.scoped"));

  const requestWhere = condition;
  const [products, activeThresholdRows, thresholdHistory, totalRows] = await Promise.all([
    db.select({ id: product.id, name: product.name, unit: product.unit, categoryCode: product.categoryCode })
      .from(product).orderBy(product.name).limit(500),
    db.selectDistinctOn([stockSellThroughThreshold.scopeType, stockSellThroughThreshold.scopeKey], {
      id: stockSellThroughThreshold.id,
      scopeType: stockSellThroughThreshold.scopeType,
      scopeKey: stockSellThroughThreshold.scopeKey,
      thresholdPercent: stockSellThroughThreshold.thresholdPercent,
      effectiveAt: stockSellThroughThreshold.effectiveAt,
      reason: stockSellThroughThreshold.reason,
      createdAt: stockSellThroughThreshold.createdAt,
    }).from(stockSellThroughThreshold).where(lte(stockSellThroughThreshold.effectiveAt, now))
      .orderBy(asc(stockSellThroughThreshold.scopeType), asc(stockSellThroughThreshold.scopeKey), desc(stockSellThroughThreshold.effectiveAt), desc(stockSellThroughThreshold.createdAt), desc(stockSellThroughThreshold.id)),
    db.select({
      id: stockSellThroughThreshold.id,
      scopeType: stockSellThroughThreshold.scopeType,
      scopeKey: stockSellThroughThreshold.scopeKey,
      thresholdPercent: stockSellThroughThreshold.thresholdPercent,
      effectiveAt: stockSellThroughThreshold.effectiveAt,
      reason: stockSellThroughThreshold.reason,
      createdAt: stockSellThroughThreshold.createdAt,
      actorName: thresholdActor.name,
    }).from(stockSellThroughThreshold)
      .innerJoin(thresholdActor, eq(stockSellThroughThreshold.createdByUserId, thresholdActor.id))
      .orderBy(desc(stockSellThroughThreshold.createdAt)).limit(20),
    db.select({ total: count() }).from(stockRestockRequest).where(requestWhere),
  ]);

  const total = totalRows[0]?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageCondition = condition;
  const requests = await db.select({
    id: stockRestockRequest.id,
    businessId: stockRestockRequest.businessId,
    businessName: business.businessName,
    ownerName: business.name,
    productId: stockRestockRequest.productId,
    productName: product.name,
    productUnit: product.unit,
    requestedQuantity: stockRestockRequest.requestedQuantity,
    requesterName: requester.name,
    cycleStartedAt: stockRestockRequest.cycleStartedAt,
    thresholdPercent: stockRestockRequest.thresholdPercent,
    baselineQuantity: stockRestockRequest.baselineQuantity,
    cohortQuantity: stockRestockRequest.cohortQuantity,
    qualifyingSalesQuantity: stockRestockRequest.qualifyingSalesQuantity,
    requiredSalesQuantity: stockRestockRequest.requiredSalesQuantity,
    sellThroughPercent: stockRestockRequest.sellThroughPercent,
    reviewerName: reviewer.name,
    eligibilityStatus: stockRestockRequest.eligibilityStatus,
    eligibilityReason: stockRestockRequest.eligibilityReason,
    exceptionReason: stockRestockRequest.exceptionReason,
    exceptionStatus: stockRestockRequest.exceptionStatus,
    reviewReason: stockRestockRequest.reviewReason,
    reviewedAt: stockRestockRequest.reviewedAt,
    createdAt: stockRestockRequest.createdAt,
  }).from(stockRestockRequest)
    .innerJoin(business, eq(stockRestockRequest.businessId, business.id))
    .innerJoin(product, eq(stockRestockRequest.productId, product.id))
    .innerJoin(requester, eq(stockRestockRequest.requestedByUserId, requester.id))
    .leftJoin(reviewer, eq(stockRestockRequest.reviewedByUserId, reviewer.id))
    .where(pageCondition)
    .orderBy(desc(stockRestockRequest.createdAt))
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  const businessIds = [...new Set(requests.map((request) => request.businessId))];
  const productIds = [...new Set(requests.map((request) => request.productId))];
  const cycles = businessIds.length && productIds.length
    ? await db.select({ businessId: stockSellThroughCycle.businessId, productId: stockSellThroughCycle.productId, baselineStatus: stockSellThroughCycle.baselineStatus })
      .from(stockSellThroughCycle)
      .where(and(inArray(stockSellThroughCycle.businessId, businessIds), inArray(stockSellThroughCycle.productId, productIds)))
    : [];
  const cycleStatus = new Map(cycles.map((cycle) => [`${cycle.businessId}:${cycle.productId}`, cycle.baselineStatus]));
  const productById = new Map(products.map((item) => [item.id, item]));
  const categories = [...new Set(products.map((item) => item.categoryCode).filter((value): value is string => Boolean(value)))].sort();
  const result = params.result ? RESULT_MESSAGES[params.result] : undefined;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Stock Restock Control</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage prospective sell-through thresholds and review eligibility requests. Decisions here do not create supplier orders, goods receipts, stock movements, or VAT postings.</p>
      </header>
      {result && <div className={`rounded-md border p-3 text-sm ${result.tone}`} role="status">{result.text}</div>}

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Add a threshold revision</h2>
        </div>
        {canManageScoped || canManageGlobal ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Threshold changes are prospective and append-only. Precedence is product, then category, then system default. Stock Control Administrators can manage product/category scopes; only Super Admin can manage the system default.</p>
            <SellThroughThresholdForm products={products} categories={categories} canManageGlobal={canManageGlobal} effectiveAtDefault={new Date(now.getTime() + 120_000).toISOString().slice(0, 16)} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Your current role can review requests but cannot change threshold settings.</p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Active threshold scopes</h2>
        </div>
        {activeThresholdRows.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No active threshold is configured. Requests will require officer review until a policy is scheduled and effective.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead><tr className="border-b text-muted-foreground"><th className="py-2 pr-3">Scope</th><th className="py-2 pr-3">Threshold</th><th className="py-2 pr-3">Effective</th><th className="py-2">Reason</th></tr></thead>
              <tbody>{activeThresholdRows.map((row) => {
                const item = row.scopeType === "product" ? productById.get(row.scopeKey) : undefined;
                return <tr key={row.id} className="border-b last:border-0"><td className="py-3 pr-3 font-medium">{row.scopeType === "default" ? "System default" : row.scopeType === "category" ? `Category · ${row.scopeKey}` : `Product · ${item?.name ?? row.scopeKey}`}</td><td className="py-3 pr-3">{row.thresholdPercent}%</td><td className="py-3 pr-3">{row.effectiveAt.toLocaleString()}</td><td className="py-3 text-muted-foreground">{row.reason}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Restock requests ({total.toLocaleString()})</h2>
        </div>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">Filter
            <select name="status" defaultValue={filter} className="block rounded-md border border-input bg-background px-3 py-2">
              <option value="all">All requests</option>
              <option value="pending_exception">Exception review pending</option>
              <option value="blocked">Below threshold</option>
              <option value="review_required">Data review required</option>
              <option value="eligible">Eligible</option>
            </select>
          </label>
          <button type="submit" className="rounded-md border px-3 py-2 text-sm">Apply filter</button>
        </form>
        {requests.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No restock requests match this filter.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const baselineNeedsReview = cycleStatus.get(`${request.businessId}:${request.productId}`) === "needs_review";
              const reasonNeedsManualStockAction = request.eligibilityReason.startsWith("An open reservation")
                || request.eligibilityReason.startsWith("A reliable non-negative current stock balance");
              const canAttestBaseline = canManageScoped
                && !reasonNeedsManualStockAction
                && (baselineNeedsReview || (
                  request.eligibilityStatus === "review_required"
                  && !request.eligibilityReason.startsWith("No valid active threshold")
                ));
              return (
                <article key={request.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{request.productName} · {request.businessName ?? request.ownerName}</h3>
                      <p className="text-sm text-muted-foreground">Requested {request.requestedQuantity.toLocaleString()} {request.productUnit} · {request.createdAt.toLocaleString()} · Submitted by {request.requesterName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-medium">
                      <span className="rounded-full bg-muted px-2.5 py-1">Eligibility: {statusLabel(request.eligibilityStatus)}</span>
                      {request.exceptionStatus !== "none" && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">Exception {statusLabel(request.exceptionStatus)}</span>}
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{request.eligibilityReason}</p>
                  {request.eligibilityStatus !== "review_required" && request.thresholdPercent !== null && <p className="mt-1 text-sm text-muted-foreground">Recorded sales {request.qualifyingSalesQuantity.toLocaleString()} of {request.cohortQuantity.toLocaleString()} cohort units · required {request.requiredSalesQuantity.toLocaleString()} · threshold {request.thresholdPercent}%{request.sellThroughPercent === null ? "" : ` · cohort sell-through ${request.sellThroughPercent.toFixed(1)}%`}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Calculation cohort began {request.cycleStartedAt.toLocaleString()}.</p>
                  {request.exceptionReason && <p className="mt-2 text-sm text-muted-foreground">Trader’s exception reason: {request.exceptionReason}</p>}
                  {request.reviewReason && <p className="mt-2 text-sm text-muted-foreground">Officer decision by {request.reviewerName ?? "authorized officer"}{request.reviewedAt ? ` · ${request.reviewedAt.toLocaleString()}` : ""}: {request.reviewReason}</p>}

                  {request.exceptionStatus === "pending" && <><p className="mt-3 text-xs text-muted-foreground">Approving an exception records this request’s exception outcome only. It does not post stock or tax.</p><RestockExceptionReviewForm requestId={request.id} /></>}
                  {canAttestBaseline && (
                    <div className="mt-4 rounded-md bg-amber-50 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-950"><ShieldAlert className="h-4 w-4" aria-hidden="true" />Recorded stock needs review</div>
                      <p className="mt-1 text-xs text-amber-900">After reviewing the evidence, an authorized officer may start a new prospective calculation baseline from the current recorded TaxFlow balance. This does not verify physical inventory or repair prior movement history.</p>
                      <BaselineAttestationForm businessId={request.businessId} productId={request.productId} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {currentPage} of {pageCount} · showing up to {PAGE_SIZE} requests per page</span>
          <div className="flex gap-2">
            {currentPage > 1 && <a className="rounded-md border px-3 py-2" href={`/admin/stock-control?status=${filter}&page=${currentPage - 1}`}>Previous</a>}
            {currentPage < pageCount && <a className="rounded-md border px-3 py-2" href={`/admin/stock-control?status=${filter}&page=${currentPage + 1}`}>Next</a>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Package className="h-5 w-5" aria-hidden="true" /><h2 className="text-lg font-semibold">Recent threshold changes</h2></div>
        {thresholdHistory.length === 0 ? <p className="text-sm text-muted-foreground">No threshold revisions have been recorded.</p> : (
          <div className="space-y-2">{thresholdHistory.map((row) => <div key={row.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm last:border-0"><div><span className="font-medium">{row.scopeType === "default" ? "System default" : row.scopeType === "category" ? `Category · ${row.scopeKey}` : `Product · ${productById.get(row.scopeKey)?.name ?? row.scopeKey}`}</span><span className="ml-2">{row.thresholdPercent}%</span><p className="text-xs text-muted-foreground">{row.reason}</p></div><p className="text-xs text-muted-foreground">{row.actorName} · {row.createdAt.toLocaleString()} · effective {row.effectiveAt.toLocaleString()}</p></div>)}</div>
        )}
      </section>
    </main>
  );
}
