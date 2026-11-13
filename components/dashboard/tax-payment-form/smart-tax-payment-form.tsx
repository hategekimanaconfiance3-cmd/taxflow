"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Smartphone,
  Landmark,
  Banknote,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Info,
  Receipt,
  Plus,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { submitSmartTaxPayment } from "@/lib/actions/compliance-smart-payment.action";
import type { SavedPaymentMethod } from "@/lib/actions/payment-method.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentMethod = "mobile_money" | "bank_transfer" | "cash";
type Step = "method" | "amount" | "review" | "done";

interface SmartTaxPaymentFormProps {
  outstanding: number;
  savedMethods: SavedPaymentMethod[];
  businessName: string;
}

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  mobile_money: <Smartphone className="h-5 w-5" />,
  bank_transfer: <Landmark className="h-5 w-5" />,
  cash: <Banknote className="h-5 w-5" />,
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
  cash: "Cash / Office Payment",
};

const METHOD_DESCRIPTIONS: Record<PaymentMethod, string> = {
  mobile_money: "Pay via MTN MoMo or Airtel Money",
  bank_transfer: "Transfer from your bank account",
  cash: "Pay in person at a TF office",
};

function formatRWF(n: number) {
  return `${Math.round(n).toLocaleString()} RWF`;
}

function statusBadge(status: string) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Method selector
// ---------------------------------------------------------------------------

interface MethodStepProps {
  savedMethods: SavedPaymentMethod[];
  selectedSavedId: string | null;
  selectedMethod: PaymentMethod;
  oneOffPhone: string;
  onSelectSaved: (id: string | null) => void;
  onSelectMethod: (m: PaymentMethod) => void;
  onChangePhone: (v: string) => void;
  onNext: () => void;
  outstanding: number;
}

function MethodStep({
  savedMethods,
  selectedSavedId,
  selectedMethod,
  oneOffPhone,
  onSelectSaved,
  onSelectMethod,
  onChangePhone,
  onNext,
  outstanding,
}: MethodStepProps) {
  const needsIdentifier =
    !selectedSavedId && (selectedMethod === "mobile_money" || selectedMethod === "bank_transfer");
  const canContinue =
    outstanding > 0 &&
    (!needsIdentifier || oneOffPhone.trim().length >= 7);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-sm">Choose Payment Method</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select how you want to pay your outstanding tax.
        </p>
      </div>

      {/* Saved methods */}
      {savedMethods.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Saved Methods
          </p>
          <div className="space-y-2">
            {savedMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSelectSaved(m.id);
                  onSelectMethod(
                    m.provider === "bank_transfer" ? "bank_transfer" : "mobile_money"
                  );
                }}
                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${selectedSavedId === m.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  {m.provider === "bank_transfer" ? (
                    <Landmark className="h-4 w-4" />
                  ) : (
                    <Smartphone className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">
                      {m.label ?? m.providerLabel}
                    </span>
                    {m.isDefault && (
                      <Star className="h-3 w-3 text-amber-500 shrink-0" fill="currentColor" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{m.maskedIdentifier}</p>
                </div>
                {selectedSavedId === m.id && (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Other methods */}
      <div className="space-y-2">
        {savedMethods.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Other Options
          </p>
        )}
        <div className="grid gap-2">
          {(["mobile_money", "bank_transfer", "cash"] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onSelectSaved(null);
                onSelectMethod(m);
              }}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${!selectedSavedId && selectedMethod === m
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50"
                }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                {METHOD_ICONS[m]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{METHOD_LABELS[m]}</p>
                <p className="text-xs text-muted-foreground">{METHOD_DESCRIPTIONS[m]}</p>
              </div>
              {!selectedSavedId && selectedMethod === m && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* One-off identifier */}
      {!selectedSavedId && (selectedMethod === "mobile_money" || selectedMethod === "bank_transfer") && (
        <div className="space-y-1.5">
          <Label className="text-sm">
            {selectedMethod === "mobile_money" ? "Mobile Money Number" : "Bank Account Number"}
          </Label>
          <Input
            value={oneOffPhone}
            onChange={(e) => onChangePhone(e.target.value)}
            placeholder={selectedMethod === "mobile_money" ? "+250 78 000 0000" : "Account number"}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            This number will be masked on your receipt. It is not saved permanently.
          </p>
        </div>
      )}

      {selectedMethod === "cash" && (
        <div className="rounded-md border bg-blue-50 px-3 py-2.5 text-sm text-blue-700 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            For cash payments, visit your nearest TF office. Submit this payment request first, then bring the receipt reference to the office.
          </span>
        </div>
      )}

      <Button
        onClick={onNext}
        disabled={!canContinue}
        className="w-full gap-1.5"
      >
        Continue
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Amount selector
// ---------------------------------------------------------------------------

interface AmountStepProps {
  outstanding: number;
  pct: number;
  customAmt: string;
  onChangePct: (p: number) => void;
  onChangeCustom: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function AmountStep({ outstanding, pct, customAmt, onChangePct, onChangeCustom, onNext, onBack }: AmountStepProps) {
  const min95 = Math.round(0.95 * outstanding);
  const max100 = outstanding;
  const computedAmt = Math.round((pct / 100) * outstanding);
  const remaining = outstanding - computedAmt;

  const presets = [
    { label: "95%", value: 95, amount: min95 },
    { label: "100%", value: 100, amount: max100 },
  ];

  const customNum = parseInt(customAmt.replace(/,/g, ""), 10);
  const customValid =
    !isNaN(customNum) && customNum >= min95 && customNum <= max100;
  const isCustomActive = ![95, 100].includes(pct);

  const canContinue = pct === 95 || pct === 100 || (isCustomActive && customValid);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-sm">Select Payment Amount</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pay between 95% and 100% of your outstanding balance.
        </p>
      </div>

      {/* Outstanding balance */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">Outstanding Tax Balance</p>
        <p className="text-2xl font-bold font-mono mt-0.5">{formatRWF(outstanding)}</p>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => { onChangePct(p.value); onChangeCustom(""); }}
            className={`rounded-lg border p-3 text-left transition-colors ${pct === p.value && !isCustomActive
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{p.label}</span>
              {pct === p.value && !isCustomActive && (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </div>
            <p className="text-sm font-mono text-muted-foreground mt-0.5">{formatRWF(p.amount)}</p>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="space-y-1.5">
        <Label className="text-sm">Custom Amount (RWF)</Label>
        <Input
          value={customAmt}
          onChange={(e) => {
            const v = e.target.value;
            onChangeCustom(v);
            const n = parseInt(v.replace(/,/g, ""), 10);
            if (!isNaN(n) && outstanding > 0) {
              const computedPct = (n / outstanding) * 100;
              onChangePct(Math.min(100, Math.max(0, computedPct)));
            }
          }}
          placeholder={`${min95.toLocaleString()} – ${max100.toLocaleString()}`}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Min: {formatRWF(min95)} (95%) · Max: {formatRWF(max100)} (100%)
        </p>
        {customAmt && !customValid && (
          <p className="text-xs text-red-600">
            Amount must be between {formatRWF(min95)} and {formatRWF(max100)}.
          </p>
        )}
      </div>

      {/* Summary row */}
      {canContinue && (
        <div className="rounded-lg border px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You will pay</span>
            <span className="font-mono font-semibold">
              {isCustomActive && customValid
                ? formatRWF(customNum)
                : formatRWF(computedAmt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining after payment</span>
            <span className={`font-mono font-semibold ${(isCustomActive ? outstanding - customNum : remaining) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {isCustomActive && customValid
                ? formatRWF(outstanding - customNum)
                : formatRWF(remaining)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Percentage</span>
            <span className="font-mono">
              {isCustomActive && customValid
                ? ((customNum / outstanding) * 100).toFixed(1)
                : pct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} disabled={!canContinue} className="flex-1 gap-1.5">
          Review Payment
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Review & submit
// ---------------------------------------------------------------------------

interface ReviewStepProps {
  outstanding: number;
  payAmount: number;
  payPct: number;
  method: PaymentMethod;
  savedMethod: SavedPaymentMethod | null;
  oneOffPhone: string;
  reference: string;
  onChangeRef: (v: string) => void;
  isSubmitting: boolean;
  error: string;
  onSubmit: () => void;
  onBack: () => void;
  businessName: string;
}

function ReviewStep({
  outstanding,
  payAmount,
  payPct,
  method,
  savedMethod,
  oneOffPhone,
  reference,
  onChangeRef,
  isSubmitting,
  error,
  onSubmit,
  onBack,
  businessName,
}: ReviewStepProps) {
  const remaining = outstanding - payAmount;

  const payerDisplay = savedMethod
    ? savedMethod.maskedIdentifier
    : method === "cash"
      ? "TF Office"
      : oneOffPhone
        ? oneOffPhone.slice(0, 4) + " *** " + oneOffPhone.slice(-3)
        : "—";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-sm">Review Payment</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Confirm all details before submitting.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border divide-y text-sm">
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Business</span>
          <span className="font-medium">{businessName}</span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Outstanding Balance</span>
          <span className="font-mono">{formatRWF(outstanding)}</span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Payment Amount</span>
          <span className="font-mono font-bold text-base">{formatRWF(payAmount)}</span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Percentage</span>
          <span className="font-mono">{payPct.toFixed(1)}%</span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Payment Method</span>
          <span>{METHOD_LABELS[method]}</span>
        </div>
        {payerDisplay !== "—" && (
          <div className="px-4 py-3 flex justify-between">
            <span className="text-muted-foreground">Account / Number</span>
            <span className="font-mono">{payerDisplay}</span>
          </div>
        )}
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Remaining After Payment</span>
          <span className={`font-mono font-semibold ${remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {formatRWF(remaining)}
          </span>
        </div>
      </div>

      {/* Optional reference */}
      <div className="space-y-1.5">
        <Label className="text-sm">
          Reference / Receipt No.{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          value={reference}
          onChange={(e) => onChangeRef(e.target.value)}
          placeholder="e.g. MTN transaction ID or bank ref"
          className="font-mono"
          maxLength={100}
        />
      </div>

      {/* Security notice */}
      <div className="rounded-md border bg-blue-50 px-3 py-2.5 text-xs text-blue-700 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          TaxFlow never requests your PIN. After submitting, your payment will be reviewed by an TF officer against evidence from your payment provider.
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onSubmit} disabled={isSubmitting} className="flex-1 gap-1.5">
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Submit Payment Request
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Done / confirmation
// ---------------------------------------------------------------------------

interface DoneStepProps {
  paymentRef: string;
  payAmount: number;
  remaining: number;
  method: string;
  onReset: () => void;
}

function DoneStep({ paymentRef, payAmount, remaining, method, onReset }: DoneStepProps) {
  return (
    <div className="space-y-5 text-center py-2">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Payment Submitted</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your payment request has been submitted for TF review. You will be notified when it is confirmed.
        </p>
      </div>

      <div className="rounded-lg border divide-y text-sm text-left">
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Reference</span>
          <span className="font-mono font-semibold">{paymentRef}</span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Amount Submitted</span>
          <span className="font-mono">{formatRWF(payAmount)}</span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Remaining Balance</span>
          <span className={`font-mono ${remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {formatRWF(remaining)}
          </span>
        </div>
        <div className="px-4 py-3 flex justify-between">
          <span className="text-muted-foreground">Status</span>
          {statusBadge("pending")}
        </div>
      </div>

      <div className="rounded-md border bg-amber-50 px-3 py-2.5 text-xs text-amber-700 text-left flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Your tax balance will be updated only after an TF officer verifies the payment against your {METHOD_LABELS[method as PaymentMethod] ?? method} provider statement.
        </span>
      </div>

      <Button variant="outline" onClick={onReset} className="w-full gap-1.5">
        <Plus className="h-4 w-4" />
        Make Another Payment
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { key: Step; label: string }[] = [
  { key: "method", label: "Method" },
  { key: "amount", label: "Amount" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${i <= idx
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
              }`}
          >
            {i < idx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`ml-1 mr-2 text-xs hidden sm:inline ${i === idx ? "font-medium" : "text-muted-foreground"}`}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-4 sm:w-6 mr-1 ${i < idx ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const STORAGE_KEY = "taxflow-smart-payment-idempotency-key";

export function SmartTaxPaymentForm({
  outstanding,
  savedMethods,
  businessName,
}: SmartTaxPaymentFormProps) {
  const router = useRouter();
  const noTaxDue = outstanding <= 0;

  // Step state
  const [step, setStep] = useState<Step>("method");

  // Method step state
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(
    savedMethods.find((m) => m.isDefault)?.id ?? savedMethods[0]?.id ?? null
  );
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    savedMethods.length > 0
      ? (savedMethods.find((m) => m.isDefault)?.provider === "bank_transfer"
        ? "bank_transfer"
        : "mobile_money")
      : "mobile_money"
  );
  const [oneOffPhone, setOneOffPhone] = useState("");

  // Amount step state
  const [pct, setPct] = useState(100);
  const [customAmt, setCustomAmt] = useState("");

  // Review step state
  const [reference, setReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Done step state
  const [donePaymentRef, setDonePaymentRef] = useState("");
  const [donePayAmount, setDonePayAmount] = useState(0);
  const [doneRemaining, setDoneRemaining] = useState(0);

  const selectedSavedMethod = savedMethods.find((m) => m.id === selectedSavedId) ?? null;

  // Compute final payment amount
  const resolvedCustomNum = parseInt(customAmt.replace(/,/g, ""), 10);
  const isCustom = ![95, 100].includes(pct) && !isNaN(resolvedCustomNum);
  const payAmount = isCustom ? resolvedCustomNum : Math.round((pct / 100) * outstanding);
  const resolvedPct = outstanding > 0 ? (payAmount / outstanding) * 100 : 100;

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const idempotencyKey =
        sessionStorage.getItem(STORAGE_KEY) ?? crypto.randomUUID();
      sessionStorage.setItem(STORAGE_KEY, idempotencyKey);

      const result = await submitSmartTaxPayment(
        {
          method: selectedMethod,
          reference: reference.trim() || undefined,
          paymentPercentage: parseFloat(resolvedPct.toFixed(2)),
          savedMethodId: selectedSavedId ?? undefined,
          oneOffIdentifier: !selectedSavedId && oneOffPhone.trim() ? oneOffPhone.trim() : undefined,
        },
        idempotencyKey,
      );

      if (!result.success) {
        setSubmitError(
          result.reference
            ? `${result.error} Support ref: ${result.reference}`
            : result.error,
        );
        return;
      }

      sessionStorage.removeItem(STORAGE_KEY);
      setDonePaymentRef(result.payment.paymentReference);
      setDonePayAmount(result.payment.amount);
      setDoneRemaining(result.remainingBalance);
      setStep("done");
      router.refresh();
    } catch {
      setSubmitError(
        "The payment request could not be recorded. Please try again or contact support.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedMethod,
    reference,
    resolvedPct,
    selectedSavedId,
    oneOffPhone,
    router,
  ]);

  const handleReset = () => {
    setStep("method");
    setSelectedSavedId(savedMethods.find((m) => m.isDefault)?.id ?? null);
    setSelectedMethod("mobile_money");
    setOneOffPhone("");
    setPct(100);
    setCustomAmt("");
    setReference("");
    setSubmitError("");
    router.refresh();
  };

  if (noTaxDue) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold">No Tax Outstanding</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your recorded VAT balance is fully settled. No payment is needed at this time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Make Tax Payment
          </CardTitle>
          <StepIndicator current={step} />
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-5">
        {step === "method" && (
          <MethodStep
            savedMethods={savedMethods}
            selectedSavedId={selectedSavedId}
            selectedMethod={selectedMethod}
            oneOffPhone={oneOffPhone}
            onSelectSaved={setSelectedSavedId}
            onSelectMethod={setSelectedMethod}
            onChangePhone={setOneOffPhone}
            onNext={() => setStep("amount")}
            outstanding={outstanding}
          />
        )}
        {step === "amount" && (
          <AmountStep
            outstanding={outstanding}
            pct={pct}
            customAmt={customAmt}
            onChangePct={setPct}
            onChangeCustom={setCustomAmt}
            onNext={() => setStep("review")}
            onBack={() => setStep("method")}
          />
        )}
        {step === "review" && (
          <ReviewStep
            outstanding={outstanding}
            payAmount={payAmount}
            payPct={resolvedPct}
            method={selectedMethod}
            savedMethod={selectedSavedMethod}
            oneOffPhone={oneOffPhone}
            reference={reference}
            onChangeRef={setReference}
            isSubmitting={isSubmitting}
            error={submitError}
            onSubmit={handleSubmit}
            onBack={() => setStep("amount")}
            businessName={businessName}
          />
        )}
        {step === "done" && (
          <DoneStep
            paymentRef={donePaymentRef}
            payAmount={donePayAmount}
            remaining={doneRemaining}
            method={selectedMethod}
            onReset={handleReset}
          />
        )}
      </CardContent>
    </Card>
  );
}
