import { requireRRASession } from '@/lib/auth-guard';
import { computeRiskScore } from '@/lib/ai/risk-scoring';
import { getFindings } from '@/lib/actions/ai-finding.action';
import db from '@/db/drizzle';
import { user, transaction, stock, product, vatRecord, taxPayment } from '@/db/schema';
import { eq, and, gte, desc, sql, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import {
  Building2,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Package,
  ArrowLeftRight,
  Users,
  BarChart3,
  ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// ---------------------------------------------------------------------------
// Risk badge
// ---------------------------------------------------------------------------
function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, string> = {
    low:      'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium:   'bg-amber-100 text-amber-700 border-amber-200',
    high:     'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <Badge variant="outline" className={cfg[level] ?? ''}>
      {level}
    </Badge>
  );
}

function ClearanceBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    approved:     'bg-emerald-100 text-emerald-700 border-emerald-200',
    pending:      'bg-amber-100 text-amber-700 border-amber-200',
    under_review: 'bg-blue-100 text-blue-700 border-blue-200',
    flagged:      'bg-orange-100 text-orange-700 border-orange-200',
    suspended:    'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <Badge variant="outline" className={cfg[status] ?? ''}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BusinessIntelligencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRRASession();
  const { id } = await params;

  // ── Fetch trader profile ─────────────────────────────────────────────────
  const [trader] = await db
    .select({
      id:              user.id,
      name:            user.name,
      businessName:    user.businessName,
      tinNumber:       user.tinNumber,
      email:           user.email,
      role:            user.role,
      clearanceStatus: user.clearanceStatus,
      createdAt:       user.createdAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  if (!trader) notFound();

  // ── Risk score ───────────────────────────────────────────────────────────
  let riskScore: Awaited<ReturnType<typeof computeRiskScore>> | null = null;
  try {
    riskScore = await computeRiskScore(id);
  } catch { /* noop */ }

  // ── Open findings ────────────────────────────────────────────────────────
  let findings: Awaited<ReturnType<typeof getFindings>> = [];
  try {
    findings = await getFindings({ businessId: id, limit: 20 });
  } catch { /* noop */ }

  // ── Last 30 days transactions ────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentTxns = await db
    .select({
      id:          transaction.id,
      productName: product.name,
      quantity:    transaction.quantity,
      unitPrice:   transaction.unitPrice,
      totalAmount: transaction.totalAmount,
      vatAmount:   transaction.vatAmount,
      status:      transaction.status,
      createdAt:   transaction.createdAt,
    })
    .from(transaction)
    .innerJoin(product, eq(transaction.productId, product.id))
    .where(
      and(
        eq(transaction.sellerId, id),
        gte(transaction.createdAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(transaction.createdAt))
    .limit(30);

  // ── Stock by product ─────────────────────────────────────────────────────
  const stockItems = await db
    .select({
      productId:   stock.productId,
      productName: product.name,
      quantity:    stock.quantity,
      price:       stock.price,
    })
    .from(stock)
    .innerJoin(product, eq(stock.productId, product.id))
    .where(eq(stock.businessId, id));

  // ── Supply chain: who they buy from (as buyer) ───────────────────────────
  const suppliers = await db
    .select({
      sellerId:     transaction.sellerId,
      sellerName:   user.businessName,
      productName:  product.name,
      totalValue:   sql<number>`SUM(${transaction.totalAmount})`,
      txnCount:     sql<number>`COUNT(*)::int`,
    })
    .from(transaction)
    .innerJoin(user, eq(transaction.sellerId, user.id))
    .innerJoin(product, eq(transaction.productId, product.id))
    .where(
      and(
        eq(transaction.buyerId, id),
        inArray(transaction.status, ['confirmed', 'completed']),
      ),
    )
    .groupBy(transaction.sellerId, user.businessName, product.name)
    .limit(10);

  // ── Supply chain: who they sell to (as seller) ───────────────────────────
  const customers = await db
    .select({
      buyerId:      transaction.buyerId,
      buyerName:    sql<string>`COALESCE(${user.businessName}, ${transaction.buyerName}, 'Unknown')`,
      productName:  product.name,
      totalValue:   sql<number>`SUM(${transaction.totalAmount})`,
      txnCount:     sql<number>`COUNT(*)::int`,
    })
    .from(transaction)
    .leftJoin(user, eq(transaction.buyerId, user.id))
    .innerJoin(product, eq(transaction.productId, product.id))
    .where(
      and(
        eq(transaction.sellerId, id),
        inArray(transaction.status, ['confirmed', 'completed']),
      ),
    )
    .groupBy(transaction.buyerId, user.businessName, transaction.buyerName, product.name)
    .limit(10);

  // ── Behavioral: underreporting rate (rejected txns / total txns) ──────────
  const [txnSummary] = await db
    .select({
      total:    sql<number>`COUNT(*)::int`,
      rejected: sql<number>`COUNT(*) FILTER (WHERE ${transaction.status} IN ('rejected','expired'))::int`,
    })
    .from(transaction)
    .where(eq(transaction.sellerId, id));

  const underreportingRate =
    (txnSummary?.total ?? 0) > 0
      ? Math.round(((txnSummary?.rejected ?? 0) / (txnSummary?.total ?? 1)) * 100)
      : 0;

  // ── VAT summary ──────────────────────────────────────────────────────────
  const [vatOut] = await db
    .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
    .from(vatRecord)
    .where(and(eq(vatRecord.businessId, id), eq(vatRecord.vatType, 'output')));

  const [taxPaid] = await db
    .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8` })
    .from(taxPayment)
    .where(and(eq(taxPayment.businessId, id), eq(taxPayment.status, 'confirmed')));

  const vatOwed = Number(vatOut?.total ?? 0);
  const vatPaid = Number(taxPaid?.total ?? 0);
  const vatOutstanding = Math.max(0, vatOwed - vatPaid);

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/admin/intelligence"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Intelligence Hub
      </Link>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {trader.businessName ?? trader.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {trader.tinNumber && (
                <span className="font-mono text-xs text-muted-foreground">{trader.tinNumber}</span>
              )}
              <Badge variant="outline" className="capitalize text-xs">{trader.role}</Badge>
              <ClearanceBadge status={trader.clearanceStatus} />
              {riskScore && <RiskBadge level={riskScore.level} />}
            </div>
          </div>
        </div>
        {riskScore && (
          <div className="flex items-center gap-2 rounded-lg border px-4 py-2 bg-muted/30">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[11px] text-muted-foreground">AI Risk Score</p>
              <p className="text-2xl font-bold tabular-nums">{riskScore.score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 1: Risk Assessment ───────────────────────────────────── */}
      {riskScore && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-500" />
              Risk Assessment — Indicator Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {riskScore.factors.map((f) => (
              <div key={f.signal}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium">{f.signal}</p>
                  <p className="text-[10px] text-muted-foreground">{f.description}</p>
                </div>
                <ProgressBar
                  value={f.value}
                  color={
                    f.value >= 75 ? 'bg-red-500' :
                    f.value >= 50 ? 'bg-orange-400' :
                    f.value >= 25 ? 'bg-amber-400' :
                    'bg-emerald-400'
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Section 2: Open Findings ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Open Intelligence Findings ({findings.filter(f => f.reviewStatus === 'open').length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Explanation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    No findings for this business.
                  </TableCell>
                </TableRow>
              )}
              {findings.map((f) => (
                <TableRow key={f.id} className="text-xs">
                  <TableCell className="font-medium capitalize">{f.findingType.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      f.severity === 'critical' ? 'bg-red-100 text-red-700 border-red-200' :
                      f.severity === 'high'     ? 'bg-orange-100 text-orange-700 border-orange-200' :
                      f.severity === 'medium'   ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }>
                      {f.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{f.explanation}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      f.reviewStatus === 'open' ? 'bg-red-50 text-red-600 border-red-200' :
                      f.reviewStatus === 'under_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-500 border-slate-200'
                    }>
                      {f.reviewStatus.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Section 3: Transaction History (last 30d) ─────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-blue-500" />
            Transaction History — Last 30 Days ({recentTxns.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTxns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    No transactions in the last 30 days.
                  </TableCell>
                </TableRow>
              )}
              {recentTxns.map((t) => (
                <TableRow key={t.id} className="text-xs">
                  <TableCell className="font-medium">{t.productName}</TableCell>
                  <TableCell className="text-right font-mono">{t.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatRWF(t.unitPrice)}</TableCell>
                  <TableCell className="text-right font-mono">{formatRWF(t.totalAmount)}</TableCell>
                  <TableCell className="text-right font-mono">{formatRWF(t.vatAmount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`capitalize text-[10px] ${
                      t.status === 'confirmed' || t.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      t.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-red-50 text-red-600 border-red-200'
                    }`}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Section 4: Stock Reconciliation ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-500" />
            Stock Reconciliation ({stockItems.length} products)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                    No stock records found.
                  </TableCell>
                </TableRow>
              )}
              {stockItems.map((s) => (
                <TableRow key={s.productId} className="text-xs">
                  <TableCell className="font-medium">{s.productName}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${s.quantity < 0 ? 'text-red-600' : s.quantity === 0 ? 'text-amber-600' : ''}`}>
                    {s.quantity}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.price != null ? formatRWF(s.price) : '—'}
                  </TableCell>
                  <TableCell>
                    {s.quantity < 0 ? (
                      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">Negative</Badge>
                    ) : s.quantity === 0 ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Empty</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Section 5: Supply Chain ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Suppliers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Suppliers (buys from)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                      No purchase history.
                    </TableCell>
                  </TableRow>
                )}
                {suppliers.map((s, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell className="font-medium">
                      {s.sellerId ? (
                        <Link href={`/admin/intelligence/business/${s.sellerId}`} className="text-blue-600 hover:underline">
                          {s.sellerName ?? s.sellerId.slice(0, 8)}
                        </Link>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.productName}</TableCell>
                    <TableCell className="text-right font-mono">{formatRWF(Number(s.totalValue))}</TableCell>
                    <TableCell className="text-right">{s.txnCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-500" />
              Customers (sells to)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                      No sales history.
                    </TableCell>
                  </TableRow>
                )}
                {customers.map((c, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell className="font-medium">
                      {c.buyerId ? (
                        <Link href={`/admin/intelligence/business/${c.buyerId}`} className="text-blue-600 hover:underline">
                          {c.buyerName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">{c.buyerName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.productName}</TableCell>
                    <TableCell className="text-right font-mono">{formatRWF(Number(c.totalValue))}</TableCell>
                    <TableCell className="text-right">{c.txnCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 6: Behavioral Analysis ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            Behavioral Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Underreporting rate */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Rejection / Expiry Rate</p>
              <p className="text-2xl font-bold tabular-nums">{underreportingRate}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {txnSummary?.rejected ?? 0} of {txnSummary?.total ?? 0} transactions
              </p>
            </div>

            {/* VAT owed vs paid */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">VAT Output</p>
              <p className="text-2xl font-bold tabular-nums">{formatRWF(vatOwed)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">VAT Paid</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{formatRWF(vatPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">VAT Outstanding</p>
              <p className={`text-2xl font-bold tabular-nums ${vatOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatRWF(vatOutstanding)}
              </p>
            </div>
          </div>

          {/* Risk trend badge */}
          {riskScore && (
            <div className="mt-4 pt-4 border-t flex items-center gap-3">
              <p className="text-xs text-muted-foreground">Risk level:</p>
              <Badge variant="outline" className={
                riskScore.level === 'critical' ? 'bg-red-100 text-red-700 border-red-200' :
                riskScore.level === 'high'     ? 'bg-orange-100 text-orange-700 border-orange-200' :
                riskScore.level === 'medium'   ? 'bg-amber-100 text-amber-700 border-amber-200' :
                'bg-emerald-100 text-emerald-700 border-emerald-200'
              }>
                {riskScore.level} ({riskScore.score}/100)
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
