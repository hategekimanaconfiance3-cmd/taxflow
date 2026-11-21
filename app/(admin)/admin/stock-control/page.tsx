import { and, asc, count, desc, eq, ilike, inArray, lte, max, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ClipboardList, Package, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { requireRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import db from "@/db/drizzle";
import { product, stock, stockMovement, stockRestockRequest, stockSellThroughCycle, stockSellThroughThreshold, user } from "@/db/schema";
import { BaselineAttestationForm, RestockExceptionReviewForm, SellThroughThresholdForm } from "@/components/stock-control/forms";
import { SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID } from "@/lib/stock-sell-through-policy";

const PAGE_SIZE = 25;
const FILTERS = ["all", "pending_exception", "blocked", "review_required", "eligible"] as const;
const SORTS = ["newest", "oldest", "requested_highest"] as const;

const RESULT_MESSAGES: Record<string, { tone: string; text: string }> = {
  threshold_saved: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The threshold revision was saved and audited. It applies from its effective date." },
  baseline_attested: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The recorded opening balance was saved as a prospective calculation baseline and audited. This action did not independently verify physical stock." },
  review_saved: { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "The exception decision was saved and audited. It did not change the request’s eligibility snapshot, inventory, or tax records." },
  invalid: { tone: "border-red-300 bg-red-50 text-red-800", text: "The change was not saved. Check the form values and reason length, then submit again." },
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
  searchParams: Promise<{ page?: string; status?: string; result?: string; q?: string; sort?: string }>;
}) {
  const { staff } = await requireRRAPermission("stock.restock.read");
  const params = await searchParams;
  const filter = FILTERS.includes(params.status as typeof FILTERS[number]) ? params.status! : "all";
  const sort = SORTS.includes(params.sort as typeof SORTS[number]) ? params.sort! : "newest";
  const searchQuery = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10_000)) : 1;
  const now = new Date();
  const business = alias(user, "stock_restock_business");
  const requester = alias(user, "stock_restock_requester");
  const reviewer = alias(user, "stock_restock_reviewer");
  const thresholdActor = alias(user, "stock_threshold_actor");
  const canManageGlobal = staff.clearanceRoles.some((role) => hasRRAPermission(role, "stock.threshold.manage.global"));
  const canManageBaseline = staff.clearanceRoles.some((role) => hasRRAPermission(role, "stock.restock.baseline.attest"));
  const canReviewExceptions = staff.clearanceRoles.some((role) => hasRRAPermission(role, "stock.restock.exception.review"));

  const escapedSearch = searchQuery.replace(/[\\%_]/g, "\\$&");
  const searchPattern = `%${escapedSearch}%`;
  const searchCondition = searchQuery ? or(
    ilike(business.businessName, searchPattern),
    ilike(business.name, searchPattern),
    ilike(product.name, searchPattern),
    ilike(stockRestockRequest.id, searchPattern),
    ilike(stockRestockRequest.eligibilityReason, searchPattern),
    ilike(stockRestockRequest.exceptionReason, searchPattern),
  ) : undefined;
  const requestWhere = and(getFilterCondition(filter), searchCondition);

  const [activeThresholdRows, thresholdHistory, totalRows, queueStatsRows] = await Promise.all([
    db.selectDistinctOn([stockSellThroughThreshold.scopeType, stockSellThroughThreshold.scopeKey], {
      id: stockSellThroughThreshold.id,
      scopeType: stockSellThroughThreshold.scopeType,
      scopeKey: stockSellThroughThreshold.scopeKey,
      thresholdPercent: stockSellThroughThreshold.thresholdPercent,
      effectiveAt: stockSellThroughThreshold.effectiveAt,
      reason: stockSellThroughThreshold.reason,
      createdAt: stockSellThroughThreshold.createdAt,
    }).from(stockSellThroughThreshold).where(and(
      eq(stockSellThroughThreshold.scopeType, "default"), eq(stockSellThroughThreshold.scopeKey, "*"),
      lte(stockSellThroughThreshold.effectiveAt, now),
    ))
      .orderBy(asc(stockSellThroughThreshold.scopeType), asc(stockSellThroughThreshold.scopeKey), desc(stockSellThroughThreshold.effectiveAt), desc(stockSellThroughThreshold.createdAt), desc(stockSellThroughThreshold.id)),
    db.select({
      id: stockSellThroughThreshold.id,
      scopeType: stockSellThroughThreshold.scopeType,
      scopeKey: stockSellThroughThreshold.scopeKey,
      thresholdPercent: stockSellThroughThreshold.thresholdPercent,
      effectiveAt: stockSellThroughThreshold.effectiveAt,
      reason: stockSellThroughThreshold.reason,
      createdAt: stockSellThroughThreshold.createdAt,
      actorRole: stockSellThroughThreshold.createdByRole,
      actorName: thresholdActor.name,
    }).from(stockSellThroughThreshold).where(and(
      eq(stockSellThroughThreshold.scopeType, "default"), eq(stockSellThroughThreshold.scopeKey, "*"),
    ))
      .leftJoin(thresholdActor, eq(stockSellThroughThreshold.createdByUserId, thresholdActor.id))
      .orderBy(desc(stockSellThroughThreshold.createdAt)).limit(20),
    db.select({ total: count() }).from(stockRestockRequest).innerJoin(business, eq(stockRestockRequest.businessId, business.id))
      .innerJoin(product, eq(stockRestockRequest.productId, product.id)).where(requestWhere),
    db.select({
      eligibilityStatus: stockRestockRequest.eligibilityStatus,
      exceptionStatus: stockRestockRequest.exceptionStatus,
      total: count(),
    }).from(stockRestockRequest).groupBy(stockRestockRequest.eligibilityStatus, stockRestockRequest.exceptionStatus),
  ]);

  const total = totalRows[0]?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const queueCounts = queueStatsRows.reduce((counts, row) => {
    counts.all += row.total;
    if (row.eligibilityStatus === "review_required") counts.reviewRequired += row.total;
    if (row.exceptionStatus === "pending") counts.pendingException += row.total;
    if (row.eligibilityStatus === "blocked") counts.blocked += row.total;
    if (row.eligibilityStatus === "eligible") counts.eligible += row.total;
    return counts;
  }, { all: 0, reviewRequired: 0, pendingException: 0, blocked: 0, eligible: 0 });
  const requestOrder = sort === "oldest"
    ? [asc(stockRestockRequest.createdAt), asc(stockRestockRequest.id)]
    : sort === "requested_highest"
      ? [desc(stockRestockRequest.requestedQuantity), desc(stockRestockRequest.createdAt)]
      : [desc(stockRestockRequest.createdAt), desc(stockRestockRequest.id)];

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
    .where(requestWhere)
    .orderBy(...requestOrder)
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  const businessIds = [...new Set(requests.map((request) => request.businessId))];
  const productIds = [...new Set(requests.map((request) => request.productId))];
  const [cycles, stockRows, movementEvidence] = businessIds.length && productIds.length
    ? await Promise.all([
      db.select({
        businessId: stockSellThroughCycle.businessId,
        productId: stockSellThroughCycle.productId,
        baselineStatus: stockSellThroughCycle.baselineStatus,
        baselineQuantity: stockSellThroughCycle.baselineQuantity,
        cycleStartedAt: stockSellThroughCycle.cycleStartedAt,
        baselineVerifiedAt: stockSellThroughCycle.baselineVerifiedAt,
      }).from(stockSellThroughCycle)
        .where(and(inArray(stockSellThroughCycle.businessId, businessIds), inArray(stockSellThroughCycle.productId, productIds))),
      db.select({ businessId: stock.businessId, productId: stock.productId, quantity: stock.quantity })
        .from(stock).where(and(inArray(stock.businessId, businessIds), inArray(stock.productId, productIds))),
      db.select({
        businessId: stockMovement.businessId,
        productId: stockMovement.productId,
        movementCount: count(),
        lastMovementAt: max(stockMovement.createdAt),
      }).from(stockMovement)
        .where(and(inArray(stockMovement.businessId, businessIds), inArray(stockMovement.productId, productIds)))
        .groupBy(stockMovement.businessId, stockMovement.productId),
    ])
    : [[], [], []];

  const pairKey = (businessId: string, productId: string) => `${businessId}:${productId}`;
  const cycleByPair = new Map(cycles.map((cycle) => [pairKey(cycle.businessId, cycle.productId), cycle]));
  const stockByPair = new Map(stockRows.map((row) => [pairKey(row.businessId, row.productId), row]));
  const movementByPair = new Map(movementEvidence.map((row) => [pairKey(row.businessId, row.productId), row]));
  const groupsByPair = new Map<string, typeof requests>();
  for (const request of requests) {
    const key = pairKey(request.businessId, request.productId);
    const group = groupsByPair.get(key);
    if (group) group.push(request);
    else groupsByPair.set(key, [request]);
  }
  const requestGroups = [...groupsByPair.entries()].map(([key, groupRequests]) => ({ key, requests: groupRequests }));
  const systemDefaultThreshold = thresholdHistory.find((row) => row.id === SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID);
  const result = params.result ? RESULT_MESSAGES[params.result] : undefined;

  const filterHref = (nextFilter: typeof FILTERS[number]) => {
    const query = new URLSearchParams();
    if (nextFilter !== "all") query.set("status", nextFilter);
    if (searchQuery) query.set("q", searchQuery);
    if (sort !== "newest") query.set("sort", sort);
    const suffix = query.toString();
    return `/admin/stock-control${suffix ? `?${suffix}` : ""}`;
  };
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filter !== "all") query.set("status", filter);
    if (searchQuery) query.set("q", searchQuery);
    if (sort !== "newest") query.set("sort", sort);
    query.set("page", String(nextPage));
    return `/admin/stock-control?${query.toString()}`;
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Stock Restock Control</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review prospective sell-through eligibility. Exception decisions and balance attestations are audited; they do not create receipts or VAT postings.</p>
      </header>
      {result && <div className={`sticky top-2 z-20 rounded-md border p-3 text-sm shadow-sm ${result.tone}`} role="status" aria-live="polite">{result.text}</div>}

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6" id="threshold-revision">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Schedule an approved threshold</h2>
        </div>
        {canManageGlobal ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Thresholds are prospective TaxFlow controls, not statutory requirements. A saved revision is audited and used only from its effective date. Global threshold changes require the existing global-management permission.</p>
            <SellThroughThresholdForm canManageGlobal={canManageGlobal} effectiveAtDefault={new Date(now.getTime() + 120_000).toISOString().slice(0, 16)} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Your role can review requests but cannot change the mandatory global policy. TaxFlow automatically enforces the system-seeded 75% default; if it is missing or invalid, purchased-stock credit is blocked and TF administrators are notified.</p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Current global threshold</h2>
        </div>
        {activeThresholdRows.length === 0 ? (
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-dashed p-4">
            <div>
              <p className="font-medium">No authorized threshold revision is active.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {systemDefaultThreshold
                  ? `The ${systemDefaultThreshold.thresholdPercent}% system default is recorded, but no valid active policy row was found.`
                  : "No system default or approved threshold revision is recorded."}
                {" "}Purchased-stock credit is fail-closed until the mandatory system policy is available; this is an integrity condition, not a manual activation step.
              </p>
            </div>
            {canManageGlobal && <a href="#threshold-revision" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Schedule a threshold</a>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead><tr className="border-b text-muted-foreground"><th className="py-2 pr-3">Scope</th><th className="py-2 pr-3">Threshold</th><th className="py-2 pr-3">Effective</th><th className="py-2">Reason</th></tr></thead>
              <tbody>{activeThresholdRows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="py-3 pr-3 font-medium">All sellers and products</td><td className="py-3 pr-3">{row.thresholdPercent}%</td><td className="py-3 pr-3">{row.effectiveAt.toLocaleString()}</td><td className="py-3 text-muted-foreground">{row.reason}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Restock review queue</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Queue totals include all requests, regardless of the current search or filter.</p>
        <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { key: "all", label: "All requests", total: queueCounts.all },
            { key: "review_required", label: "Needs officer review", total: queueCounts.reviewRequired },
            { key: "pending_exception", label: "Exception decision pending", total: queueCounts.pendingException },
            { key: "blocked", label: "Below threshold", total: queueCounts.blocked },
            { key: "eligible", label: "Eligible", total: queueCounts.eligible },
          ].map((item) => (
            <a key={item.key} href={filterHref(item.key as typeof FILTERS[number])} className={`rounded-lg border p-3 transition-colors hover:bg-muted/60 ${filter === item.key ? "border-primary bg-muted/50" : ""}`} aria-current={filter === item.key ? "page" : undefined}>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
              <span className="mt-1 block text-xl font-semibold">{item.total.toLocaleString()}</span>
            </a>
          ))}
        </div>

        <form method="get" className="mb-4 grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_minmax(12rem,0.8fr)_minmax(11rem,0.7fr)_auto] xl:items-end">
          <label className="space-y-1 text-sm font-medium">Search requests
            <input name="q" type="search" maxLength={100} defaultValue={searchQuery} placeholder="Trader, product, request ID…" className="block w-full rounded-md border border-input bg-background px-3 py-2 font-normal" />
          </label>
          <label className="space-y-1 text-sm font-medium">Queue filter
            <select name="status" defaultValue={filter} className="block w-full rounded-md border border-input bg-background px-3 py-2 font-normal">
              <option value="all">All requests</option>
              <option value="pending_exception">Exception decision pending</option>
              <option value="blocked">Below threshold</option>
              <option value="review_required">Needs officer review</option>
              <option value="eligible">Eligible</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Sort by
            <select name="sort" defaultValue={sort} className="block w-full rounded-md border border-input bg-background px-3 py-2 font-normal">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="requested_highest">Largest quantity</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md border bg-background px-4 py-2 text-sm font-medium">Apply</button>
            {(searchQuery || filter !== "all" || sort !== "newest") && <a href="/admin/stock-control" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Clear</a>}
          </div>
        </form>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">{total.toLocaleString()} matching request{total === 1 ? "" : "s"}{searchQuery ? ` for “${searchQuery}”` : ""}</p>
          <p className="text-xs text-muted-foreground">Showing up to {PAGE_SIZE} requests per page</p>
        </div>

        {requestGroups.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">{searchQuery || filter !== "all" ? "No requests match these search and filter settings." : "No restock requests have been submitted."}</p>
        ) : (
          <div className="space-y-4">
            {requestGroups.map(({ key, requests: groupRequests }) => {
              const first = groupRequests[0]!;
              const businessName = first.businessName?.trim() || first.ownerName || "Unknown business";
              const pair = cycleByPair.get(key);
              const stockRow = stockByPair.get(key);
              const movement = movementByPair.get(key);
              const baselineNeedsReview = pair?.baselineStatus === "needs_review";
              const hasBlockingReason = groupRequests.some((request) => request.eligibilityReason.startsWith("An open reservation")
                || request.eligibilityReason.startsWith("A reliable non-negative current stock balance"));
              const hasBaselineReviewReason = groupRequests.some((request) => request.eligibilityStatus === "review_required"
                && !request.eligibilityReason.startsWith("No valid active threshold"));
              const canAttestBaseline = canManageBaseline && !hasBlockingReason && Boolean(stockRow)
                && (baselineNeedsReview || hasBaselineReviewReason);
              const groupEligibilityStatuses = [...new Set(groupRequests.map((request) => request.eligibilityStatus))];

              return (
                <article key={key} className="overflow-hidden rounded-lg border">
                  <div className="flex flex-wrap items-start justify-between gap-3 bg-muted/30 p-4">
                    <div>
                      <h3 className="font-semibold">{first.productName} · {businessName}</h3>
                      <p className="text-sm text-muted-foreground">{groupRequests.length} related restock request{groupRequests.length === 1 ? "" : "s"} · {first.productUnit}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {groupEligibilityStatuses.map((status) => <span key={status} className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">{statusLabel(status)}</span>)}
                    </div>
                  </div>

                  <div className="divide-y">
                    {groupRequests.map((request) => (
                      <div key={request.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">Requested {request.requestedQuantity.toLocaleString()} {request.productUnit}</p>
                            <p className="text-xs text-muted-foreground">{request.createdAt.toLocaleString()} · Submitted by {request.requesterName} · Request {request.id}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs font-medium">
                            <span className="rounded-full bg-muted px-2.5 py-1">Eligibility: {statusLabel(request.eligibilityStatus)}</span>
                            {request.exceptionStatus !== "none" && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">Exception {statusLabel(request.exceptionStatus)}</span>}
                          </div>
                        </div>
                        <p className="mt-2 text-sm">{request.eligibilityReason}</p>
                        {request.eligibilityStatus !== "review_required" && request.thresholdPercent !== null && <p className="mt-1 text-sm text-muted-foreground">FIFO batch: sold {request.qualifyingSalesQuantity.toLocaleString()} of {request.cohortQuantity.toLocaleString()} units · remaining to sell {Math.max(0, request.requiredSalesQuantity - request.qualifyingSalesQuantity).toLocaleString()} · required {request.requiredSalesQuantity.toLocaleString()} at {request.thresholdPercent}%{request.sellThroughPercent === null ? "" : ` · batch sell-through ${request.sellThroughPercent.toFixed(1)}%`}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">Calculation cohort began {request.cycleStartedAt.toLocaleString()}.</p>
                        {request.exceptionReason && <p className="mt-2 rounded-md bg-muted/40 p-2 text-sm"><span className="font-medium">Trader’s exception reason:</span> {request.exceptionReason}</p>}
                        {request.reviewReason && <p className="mt-2 rounded-md border-l-2 border-primary/50 bg-muted/30 p-2 text-sm"><span className="font-medium">Officer decision:</span> {request.reviewReason}<span className="mt-1 block text-xs text-muted-foreground">{request.reviewerName ?? "Authorized officer"}{request.reviewedAt ? ` · ${request.reviewedAt.toLocaleString()}` : ""}</span></p>}
                        {request.exceptionStatus === "pending" && canReviewExceptions && <><p className="mt-3 text-xs text-muted-foreground">An exception decision records the officer’s outcome for this request. Approval does not post stock or change tax records.</p><RestockExceptionReviewForm requestId={request.id} /></>}
                      </div>
                    ))}
                  </div>

                  <div className="border-t bg-background p-4">
                    <h4 className="text-sm font-semibold">Recorded stock evidence</h4>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                      <p><span className="block text-xs text-muted-foreground">Current TaxFlow balance</span>{stockRow ? `${Number(stockRow.quantity).toLocaleString()} ${first.productUnit}` : "No stock row"}</p>
                      <p><span className="block text-xs text-muted-foreground">Calculation baseline</span>{pair ? `${Number(pair.baselineQuantity).toLocaleString()} ${first.productUnit} · ${statusLabel(pair.baselineStatus)}` : "No current cohort"}</p>
                      <p><span className="block text-xs text-muted-foreground">Movement history</span>{movement ? `${movement.movementCount.toLocaleString()} recorded · latest ${movement.lastMovementAt?.toLocaleString() ?? "date unavailable"}` : "No stock movements recorded"}</p>
                    </div>
                    {pair?.cycleStartedAt && <p className="mt-2 text-xs text-muted-foreground">Current calculation cohort began {pair.cycleStartedAt.toLocaleString()}{pair.baselineVerifiedAt ? ` · baseline attested ${pair.baselineVerifiedAt.toLocaleString()}` : ""}.</p>}

                    {canAttestBaseline && (
                      <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-950"><ShieldAlert className="h-4 w-4" aria-hidden="true" />Review and attest the recorded baseline</div>
                        <p className="mt-1 text-sm text-amber-950">This starts a prospective calculation cohort from the current recorded balance shown above. It does not verify physical stock or rewrite earlier movements.</p>
                        <BaselineAttestationForm businessId={first.businessId} productId={first.productId} recordedQuantity={Number(stockRow!.quantity)} unit={first.productUnit} />
                      </div>
                    )}
                    {canManageBaseline && !stockRow && baselineNeedsReview && <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Attestation is unavailable because there is no current stock row. Resolve the stock record through the existing stock workflow first.</p>}
                    {canManageBaseline && hasBlockingReason && <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Baseline attestation is paused while this item has an unresolved reservation or an unreliable balance. Resolve it through the stock or transaction workflow first.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {currentPage} of {pageCount}</span>
          <div className="flex gap-2">
            {currentPage > 1 && <a className="rounded-md border px-3 py-2" href={pageHref(currentPage - 1)}>Previous</a>}
            {currentPage < pageCount && <a className="rounded-md border px-3 py-2" href={pageHref(currentPage + 1)}>Next</a>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Package className="h-5 w-5" aria-hidden="true" /><h2 className="text-lg font-semibold">Threshold history</h2></div>
        {thresholdHistory.length === 0 ? <p className="text-sm text-muted-foreground">No threshold revisions have been recorded.</p> : (
          <div className="space-y-2">{thresholdHistory.map((row, index) => {
            const isSystemDefault = row.id === SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID;
            const previousThreshold = thresholdHistory[index + 1]?.thresholdPercent;
            return (
              <div key={row.id} className="flex flex-wrap justify-between gap-2 border-b py-3 text-sm last:border-0">
                <div>
                  <span className="font-medium">{isSystemDefault ? `System default · ${row.thresholdPercent}% · active` : `Threshold revision · ${previousThreshold ?? "—"}% → ${row.thresholdPercent}%`}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{row.reason}{isSystemDefault ? " This baseline is used until an authorized revision takes effect." : ""}</p>
                </div>
                <p className="text-xs text-muted-foreground">{row.actorName ?? "TaxFlow initial default"} · {row.actorRole ?? "system"} · recorded {row.createdAt.toLocaleString()} · effective {row.effectiveAt.toLocaleString()}</p>
              </div>
            );
          })}</div>
        )}
      </section>
    </main>
  );
}
