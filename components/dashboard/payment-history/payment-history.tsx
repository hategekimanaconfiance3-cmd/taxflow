"use client";

import { Receipt, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PaymentHistoryItem } from "@/lib/actions/compliance-smart-payment.action";

const METHOD_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "confirmed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

function StatusBadge({ status, workflowStatus }: { status: string; workflowStatus: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" },
    pending: { label: workflowStatus === "REVIEW_REQUIRED" ? "Under Review" : "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function formatRWF(n: number) {
  return `${Math.round(n).toLocaleString()} RWF`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-RW", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface PaymentRowProps {
  item: PaymentHistoryItem;
}

function PaymentRow({ item }: PaymentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = item.paymentPercentage ? parseFloat(item.paymentPercentage).toFixed(1) : null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <StatusIcon status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold">{item.paymentReference}</span>
            <StatusBadge status={item.status} workflowStatus={item.workflowStatus} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(item.createdAt)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono font-semibold text-sm">{formatRWF(item.amount)}</p>
          {pct && <p className="text-xs text-muted-foreground">{pct}%</p>}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 bg-muted/20 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <span className="text-muted-foreground text-xs">Payment Method</span>
            <span className="text-xs">{METHOD_LABELS[item.method] ?? item.method}</span>

            {item.payerDisplay && (
              <>
                <span className="text-muted-foreground text-xs">Account / Number</span>
                <span className="font-mono text-xs">{item.payerDisplay}</span>
              </>
            )}

            {item.outstandingAtSubmission != null && (
              <>
                <span className="text-muted-foreground text-xs">Balance at Submission</span>
                <span className="font-mono text-xs">{formatRWF(item.outstandingAtSubmission)}</span>
              </>
            )}

            {item.reference && (
              <>
                <span className="text-muted-foreground text-xs">Provider Reference</span>
                <span className="font-mono text-xs break-all">{item.reference}</span>
              </>
            )}

            <span className="text-muted-foreground text-xs">Workflow Status</span>
            <span className="text-xs">{item.workflowStatus.replace(/_/g, " ")}</span>
          </div>

          {/* Receipt-like footer for confirmed payments */}
          {item.status === "confirmed" && (
            <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                Payment verified by RRA. Reference: <strong className="font-mono">{item.paymentReference}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PaymentHistoryProps {
  history: PaymentHistoryItem[];
}

export function PaymentHistory({ history }: PaymentHistoryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Payment History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed px-4 py-8 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No payment history</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your submitted payment records will appear here.
            </p>
          </div>
        ) : (
          <>
            {history.map((item) => (
              <PaymentRow key={item.id} item={item} />
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              Showing last {history.length} payment record{history.length !== 1 ? "s" : ""}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
