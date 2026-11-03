'use client';

import { useState, useEffect, useTransition, useCallback, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cancelTransaction, confirmTransaction, rejectTransaction } from '@/lib/actions/transaction.action';
import { getB2BFulfillmentQueue, recordB2BDispatch, recordB2BReceipt } from '@/lib/actions/b2b-fulfillment.action';
import { useSocket } from '@/lib/socket-client';
import { useSocketContext } from '@/components/providers/socket-provider';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { TransactionStatusBadge } from '@/components/dashboard/status-badges/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, ArrowDownLeft, ArrowUpRight, Check, X, Loader2, RefreshCw, Send, Timer, PackageCheck } from 'lucide-react';

/** Pending transactions expire after 10 minutes (must match server constant). */
/** Returns remaining ms until expiry, or 0 if already expired. */
function getRemainingMs(expiresAt: Date): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function isStillPending(expiresAt: Date): boolean {
  return getRemainingMs(expiresAt) > 0;
}

// ---------------------------------------------------------------------------
// Expiry Countdown — shows "Expires in M:SS" next to each pending row
// ---------------------------------------------------------------------------

function ExpiryCountdown({ expiresAt }: { expiresAt: Date }) {
  const [remaining, setRemaining] = useState(() => getRemainingMs(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(getRemainingMs(expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (remaining <= 0) return null;

  const totalSec = Math.ceil(remaining / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground ml-2">
      <Timer className="h-3 w-3" />
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncomingTxn {
  id: string;
  sellerName: string | null;
  sellerTin: string | null;
  productName: string;
  quantity: number;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: Date;
  expiresAt: Date;
}

interface OutgoingTxn {
  id: string;
  buyerName: string | null;
  buyerTin: string | null;
  productName: string;
  quantity: number;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
}

type FulfillmentQueue = Awaited<ReturnType<typeof getB2BFulfillmentQueue>>;

function DispatchForm({ item }: { item: FulfillmentQueue['outgoing'][number] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState(String(item.remainingQuantity));
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const requestKey = useRef<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        setError('');
        await recordB2BDispatch({
          transactionId: item.transactionId,
          quantity: Number(quantity),
          dispatchReference: reference.trim() || undefined,
          idempotencyKey: requestKey.current,
        });
        requestKey.current = null;
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not record dispatch. You can retry safely.');
      }
    });
  }

  return <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
    <label className="grid gap-1 text-xs text-muted-foreground">Dispatch quantity
      <input className="h-9 w-32 rounded-md border bg-background px-3 text-sm text-foreground" type="number" min="0.000001" step="any" max={item.remainingQuantity} value={quantity} onChange={(event) => { setQuantity(event.target.value); requestKey.current = null; }} required />
    </label>
    <label className="grid gap-1 text-xs text-muted-foreground">Dispatch reference (optional)
      <input className="h-9 w-56 rounded-md border bg-background px-3 text-sm text-foreground" maxLength={120} value={reference} onChange={(event) => { setReference(event.target.value); requestKey.current = null; }} />
    </label>
    <Button size="sm" type="submit" disabled={isPending || !quantity || Number(quantity) > item.remainingQuantity}>
      {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
      Record dispatch
    </Button>
    {error && <p role="alert" className="basis-full text-xs text-red-600">{error}</p>}
  </form>;
}

function MeasuredReceiptForm({ item }: { item: FulfillmentQueue['incoming'][number] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantityReceived, setQuantityReceived] = useState(String(item.remainingQuantity));
  const [acceptedQuantity, setAcceptedQuantity] = useState(String(item.remainingQuantity));
  const [damagedQuantity, setDamagedQuantity] = useState('0');
  const [rejectedQuantity, setRejectedQuantity] = useState('0');
  const [disputedQuantity, setDisputedQuantity] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const requestKey = useRef<string | null>(null);
  const resetRequestKey = () => { requestKey.current = null; };
  const received = Number(quantityReceived);
  const classified = Number(acceptedQuantity) + Number(damagedQuantity) + Number(rejectedQuantity) + Number(disputedQuantity);
  const classificationMatches = Number.isFinite(received) && Number.isFinite(classified) && Math.abs(received - classified) < 0.000001;
  const quantityFields: Array<{ label: string; value: string; setValue: (value: string) => void }> = [
    { label: 'Measured received', value: quantityReceived, setValue: setQuantityReceived },
    { label: 'Accepted', value: acceptedQuantity, setValue: setAcceptedQuantity },
    { label: 'Damaged', value: damagedQuantity, setValue: setDamagedQuantity },
    { label: 'Rejected', value: rejectedQuantity, setValue: setRejectedQuantity },
    { label: 'Disputed', value: disputedQuantity, setValue: setDisputedQuantity },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        setError('');
        await recordB2BReceipt({
          dispatchId: item.dispatchId,
          quantityReceived: received,
          acceptedQuantity: Number(acceptedQuantity),
          damagedQuantity: Number(damagedQuantity),
          rejectedQuantity: Number(rejectedQuantity),
          disputedQuantity: Number(disputedQuantity),
          notes: notes.trim() || undefined,
          idempotencyKey: requestKey.current,
        });
        requestKey.current = null;
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not record measured receipt. You can retry safely.');
      }
    });
  }

  return <form onSubmit={submit} className="mt-3 grid gap-3 border-t pt-3">
    <p className="text-xs text-muted-foreground">Record the physical quantity received. Only the accepted quantity is added to your available stock. Damaged, rejected, and disputed quantities remain excluded.</p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {quantityFields.map(({ label, value, setValue }) => (
        <label key={label} className="grid gap-1 text-xs text-muted-foreground">{label}
          <input className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" type="number" min="0" step="any" max={item.remainingQuantity} value={value} onChange={(event) => { setValue(event.target.value); resetRequestKey(); }} required />
        </label>
      ))}
    </div>
    <label className="grid gap-1 text-xs text-muted-foreground">Receipt notes (optional)
      <input className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" maxLength={2000} value={notes} onChange={(event) => { setNotes(event.target.value); resetRequestKey(); }} />
    </label>
    {!classificationMatches && <p className="text-xs text-amber-700">Classified quantities must add up to the measured received quantity.</p>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <div><Button size="sm" type="submit" disabled={isPending || !classificationMatches || received <= 0 || received > item.remainingQuantity}>
      {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-1 h-3.5 w-3.5" />}
      Confirm measured receipt
    </Button></div>
  </form>;
}

// ---------------------------------------------------------------------------
// Inline Confirm/Reject Actions
// ---------------------------------------------------------------------------

function ConfirmRejectActions({ transactionId }: { transactionId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<"confirmed" | "rejected" | null>(null);
    const [invoiceId, setInvoiceId] = useState<string | null>(null);
    const [error, setError] = useState("");

    function handleAction(action: "confirm" | "reject") {
        startTransition(async () => {
            try {
                setError("");
                if (action === "confirm") {
                    const response = await confirmTransaction(transactionId);
                    if (!response.success) throw new Error(response.error);
                    setInvoiceId(response.invoiceId ?? null);
                    setResult("confirmed");
                } else {
                    const response = await rejectTransaction(transactionId);
                    if (!response.success) throw new Error(response.error);
                    setResult("rejected");
                }
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : `Failed to ${action}`,
                );
            }
        });
    }

    if (result) {
        return (
            <span
                className={`text-xs font-medium ${result === "confirmed"
                    ? "text-emerald-600"
                    : "text-red-500"
                    }`}
            >
                {result === "confirmed" ? "✓ Order accepted" : "✕ Rejected"}
                {result === "confirmed" && invoiceId && (
                    <a className="ml-2 underline underline-offset-2" href={`/dashboard/invoices/${invoiceId}`}>View invoice</a>
                )}
            </span>
        );
    }

    if (error) {
        return <span className="text-xs text-red-500">{error}</span>;
    }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
        onClick={() => handleAction('confirm')}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        <span className="ml-1 text-xs">Accept order</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
        onClick={() => handleAction('reject')}
        disabled={isPending}
      >
        <X className="h-3.5 w-3.5" />
        <span className="ml-1 text-xs">Reject</span>
      </Button>
    </div>
  );
}

function CancelPendingAction({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function handleCancel() {
    startTransition(async () => {
      try {
        setError('');
        await cancelTransaction(transactionId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to cancel this pending sale.');
      }
    });
  }

  return <div className="flex flex-col items-end gap-1">
    <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
      {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
      Cancel sale
    </Button>
    {error && <span className="max-w-40 text-right text-xs text-red-600">{error}</span>}
  </div>;
}

// ---------------------------------------------------------------------------
// Pending Page Client Component
// ---------------------------------------------------------------------------

interface PendingPageClientProps {
  incoming: IncomingTxn[];
  outgoing: OutgoingTxn[];
  fulfillment: FulfillmentQueue;
}

export function PendingPageClient({ incoming, outgoing, fulfillment }: PendingPageClientProps) {
  const router = useRouter();
  const { userId } = useSocketContext();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  // Force re-render ticker — incremented every 15s to evict expired items
  const [, setTick] = useState(0);

  // Auto-refresh when real-time events arrive
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useSocket(userId, {
    'txn:incoming': handleRefresh,
    'txn:confirmed': handleRefresh,
    'txn:rejected': handleRefresh,
    'txn:cancelled': handleRefresh,
  });

  // Periodic client-side check — evicts expired rows and triggers server refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);

      // If any pending item just crossed the expiry boundary, refresh from server
      const anyExpired =
        incoming.some((t) => t.status === 'pending' && !isStillPending(t.expiresAt)) ||
        outgoing.some((t) => t.status === 'pending' && !isStillPending(t.expiresAt));

      if (anyExpired) {
        router.refresh();
      }
    }, 15_000); // check every 15 seconds
    return () => clearInterval(interval);
  }, [incoming, outgoing, router]);

  // The server expires stale transactions before loading them. Keep status as
  // the source of truth here so a client clock/timestamp difference cannot hide
  // a pending confirmation that the dashboard still reports as actionable.
  const pendingIncoming = incoming.filter((t) => t.status === 'pending');
  const processedIncoming = incoming.filter((t) => t.status !== 'pending');
  const pendingOutgoing = outgoing.filter((t) => t.status === 'pending');
  const processedOutgoing = outgoing.filter((t) => t.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pending Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">Accept or reject business orders. Dispatch and measured receipt are recorded separately.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center rounded-md border border-border/60 bg-background w-fit overflow-hidden">
        <button
          onClick={() => setTab('incoming')}
          className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors ${
            tab === 'incoming' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <ArrowDownLeft className="h-3.5 w-3.5" />
          Incoming
          {pendingIncoming.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
              {pendingIncoming.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('outgoing')}
          className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors border-l border-border/60 ${
            tab === 'outgoing' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Outgoing
          {pendingOutgoing.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
              {pendingOutgoing.length}
            </span>
          )}
        </button>
      </div>

      {/* ── INCOMING TAB ──────────────────────── */}
      {tab === 'incoming' && (
        <>
          {fulfillment.incoming.length > 0 && (
            <Card className="border-emerald-200/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-emerald-600" />
                  Shipments awaiting measured receipt ({fulfillment.incoming.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">Order acceptance does not add stock. Confirm the quantity physically received; only accepted units will be credited.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {fulfillment.incoming.map((item) => (
                  <div key={item.dispatchId} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.productName} from {item.sellerName ?? 'seller'}</p>
                        <p className="text-xs text-muted-foreground">Seller TIN: {item.sellerTin ?? '—'} · Dispatched: {item.dispatchQuantity.toLocaleString()} · Already measured: {Number(item.receivedQuantity).toLocaleString()} · Remaining: {item.remainingQuantity.toLocaleString()}</p>
                        {item.dispatchReference && <p className="text-xs text-muted-foreground">Dispatch reference: {item.dispatchReference}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(item.dispatchedAt).toLocaleDateString()}</span>
                    </div>
                    <MeasuredReceiptForm item={item} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {pendingIncoming.length === 0 && fulfillment.incoming.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowDownLeft className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">No pending confirmations</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You&apos;ll see incoming purchases here when a seller creates a sale to your TIN.
                </p>
              </CardContent>
            </Card>
          ) : pendingIncoming.length > 0 ? (
            <Card className="border-amber-200/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Awaiting Your Order Decision ({pendingIncoming.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seller TIN</TableHead>
                      <TableHead>Seller Name</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingIncoming.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {txn.sellerTin ?? '—'}
                        </TableCell>
                        <TableCell className="font-medium">{txn.sellerName ?? '—'}</TableCell>
                        <TableCell>{txn.productName}</TableCell>
                        <TableCell className="text-right font-mono">{txn.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{formatRWF(txn.totalAmount)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center">
                            <TransactionStatusBadge status={txn.status} />
                            <ExpiryCountdown expiresAt={txn.expiresAt} />
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <ConfirmRejectActions transactionId={txn.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {/* Incoming history */}
          {processedIncoming.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Incoming History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seller</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedIncoming.slice(0, 10).map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="font-medium">{txn.sellerName ?? '—'}</TableCell>
                        <TableCell>{txn.productName}</TableCell>
                        <TableCell className="text-right font-mono">{formatRWF(txn.totalAmount)}</TableCell>
                        <TableCell>
                          <TransactionStatusBadge status={txn.status} />
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(txn.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── OUTGOING TAB ──────────────────────── */}
      {tab === 'outgoing' && (
        <>
          {fulfillment.outgoing.length > 0 && (
            <Card className="border-blue-200/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-600" />
                  Accepted orders awaiting dispatch ({fulfillment.outgoing.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">Record each physical dispatch separately. The buyer receives stock only after confirming measured receipt.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {fulfillment.outgoing.map((item) => (
                  <div key={item.transactionId} className="rounded-md border p-3">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.productName} to {item.buyerName ?? 'buyer'}</p>
                        <p className="text-xs text-muted-foreground">Buyer TIN: {item.buyerTin ?? '—'} · Order: {item.transactionQuantity.toLocaleString()} · Dispatched: {Number(item.dispatchedQuantity).toLocaleString()} · Remaining: {item.remainingQuantity.toLocaleString()}</p>
                      </div>
                    </div>
                    <DispatchForm item={item} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {outgoing.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">No outgoing sales yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sales you create will appear here with their confirmation status.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Pending outgoing */}
              {pendingOutgoing.length > 0 && (
                <Card className="border-blue-200/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-blue-500" />
                      Awaiting Buyer Order Acceptance ({pendingOutgoing.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Buyer TIN</TableHead>
                          <TableHead>Buyer Name</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Sent</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingOutgoing.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {txn.buyerTin ?? '—'}
                            </TableCell>
                            <TableCell className="font-medium">{txn.buyerName ?? '—'}</TableCell>
                            <TableCell>{txn.productName}</TableCell>
                            <TableCell className="text-right font-mono">{txn.quantity.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{formatRWF(txn.totalAmount)}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center">
                                <TransactionStatusBadge status={txn.status} />
                                <ExpiryCountdown expiresAt={txn.expiresAt} />
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {new Date(txn.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right"><CancelPendingAction transactionId={txn.id} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Completed/rejected outgoing */}
              {processedOutgoing.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Outgoing History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Buyer</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processedOutgoing.slice(0, 10).map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="font-medium">{txn.buyerName ?? '—'}</TableCell>
                            <TableCell>{txn.productName}</TableCell>
                            <TableCell className="text-right font-mono">{formatRWF(txn.totalAmount)}</TableCell>
                            <TableCell>
                              <TransactionStatusBadge status={txn.status} />
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {new Date(txn.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
