"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Banknote, Building2, CheckCircle2, ChevronDown, CircleDot,
  CreditCard, Info, LoaderCircle, PlusCircle, ShieldCheck,
  ShieldX, Smartphone, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  deleteCollectionAccount,
  getAccountPayments,
  getCollectionAccounts,
  registerCollectionAccount,
  reviewCollectionAccount,
  setCollectionAccountActive,
  type CollectionAccount,
  type CollectionAccountSummary,
} from "@/lib/actions/rra-collection-account.action";

// ---------------------------------------------------------------------------
// Zod validation — mirrors server schemas
// ---------------------------------------------------------------------------

const bankSchema = z.object({
  accountType: z.literal("bank_account"),
  displayName: z.string().trim().min(2, "Display name required").max(120),
  currency: z.string().trim().min(2).max(10).default("RWF"),
  description: z.string().trim().max(500).optional(),
  providerName: z.string().trim().min(2, "Bank name required").max(120),
  providerIntegration: z.string().trim().max(80).optional(),
  bankAccountHolder: z.string().trim().min(2, "Account holder required").max(160),
  bankAccountNumber: z.string().trim().min(4, "Account number required").max(30),
  bankBranch: z.string().trim().max(120).optional(),
});

const momoSchema = z.object({
  accountType: z.literal("mobile_money"),
  displayName: z.string().trim().min(2, "Display name required").max(120),
  currency: z.string().trim().min(2).max(10).default("RWF"),
  description: z.string().trim().max(500).optional(),
  providerName: z.string().trim().min(2, "Provider name required").max(120),
  providerIntegration: z.string().trim().max(80).optional(),
  merchantCode: z.string().trim().min(2, "Merchant code required").max(60),
  registeredName: z.string().trim().min(2, "Registered name required").max(160),
});

const reviewFormSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(10, "Provide at least 10 characters for audit reason.").max(500),
});

const statusSchema = z.object({
  reason: z.string().trim().min(10, "Provide at least 10 characters for audit reason.").max(500),
});

type BankFields = z.infer<typeof bankSchema>;
type MomoFields = z.infer<typeof momoSchema>;
type ReviewFields = z.infer<typeof reviewFormSchema>;
type StatusFields = z.infer<typeof statusSchema>;
type Notice = { tone: "success" | "error"; message: string } | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const money = (n: number) => `${Math.round(n).toLocaleString("en-RW")} RWF`;
const fmt = (d: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

function statusBadge(acc: CollectionAccount) {
  if (!acc.isActive && acc.verificationStatus === "verified")
    return <Badge variant="secondary">Inactive</Badge>;
  if (acc.isActive && acc.verificationStatus === "verified")
    return <Badge className="bg-emerald-600 text-white">Active</Badge>;
  if (acc.verificationStatus === "pending")
    return <Badge variant="outline" className="border-amber-500 text-amber-600">Pending</Badge>;
  if (acc.verificationStatus === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  if (acc.verificationStatus === "reverification_required")
    return <Badge variant="outline" className="border-orange-500 text-orange-600">Re-verify</Badge>;
  return <Badge variant="secondary">{acc.verificationStatus}</Badge>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  initialAccounts: CollectionAccount[];
  summary: CollectionAccountSummary;
  canManage: boolean;
  canReview: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RraCollectionAccountsWorkspace({
  initialAccounts,
  summary: initialSummary,
  canManage,
  canReview,
}: Props) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [summary, setSummary] = useState(initialSummary);
  const [selected, setSelected] = useState<CollectionAccount | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerType, setRegisterType] = useState<"bank_account" | "mobile_money">("bank_account");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"activate" | "deactivate">("deactivate");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof getAccountPayments>> extends { success: true; data: infer D } ? D : never>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "verified" | "active" | "inactive">("all");

  const bankForm = useForm<BankFields>({ resolver: zodResolver(bankSchema), defaultValues: { accountType: "bank_account", currency: "RWF" } });
  const momoForm = useForm<MomoFields>({ resolver: zodResolver(momoSchema), defaultValues: { accountType: "mobile_money", currency: "RWF" } });
  const reviewForm = useForm<ReviewFields>({ resolver: zodResolver(reviewFormSchema), defaultValues: { decision: "verified", reason: "" } });
  const statusForm = useForm<StatusFields>({ resolver: zodResolver(statusSchema), defaultValues: { reason: "" } });
  const deleteForm = useForm<StatusFields>({ resolver: zodResolver(statusSchema), defaultValues: { reason: "" } });

  const watchDecision = reviewForm.watch("decision");
  const filtered = accounts.filter((a) => {
    if (filterStatus === "pending") return a.verificationStatus === "pending";
    if (filterStatus === "verified") return a.verificationStatus === "verified";
    if (filterStatus === "active") return a.isActive;
    if (filterStatus === "inactive") return !a.isActive;
    return true;
  });

  async function refresh() {
    const res = await getCollectionAccounts("all");
    if (res.success) setAccounts(res.data);
  }

  async function submitRegister(values: BankFields | MomoFields) {
    setIsSaving(true);
    setNotice(null);
    const result = await registerCollectionAccount(values);
    setIsSaving(false);
    if (!result.success) { setNotice({ tone: "error", message: result.error }); return; }
    setRegisterOpen(false);
    bankForm.reset({ accountType: "bank_account", currency: "RWF" });
    momoForm.reset({ accountType: "mobile_money", currency: "RWF" });
    setNotice({ tone: "success", message: "Collection account registered and submitted for verification." });
    await refresh();
  }

  async function submitReview(values: ReviewFields) {
    if (!selected) return;
    setIsSaving(true);
    setNotice(null);
    const result = await reviewCollectionAccount({ accountId: selected.id, ...values });
    setIsSaving(false);
    if (!result.success) { setNotice({ tone: "error", message: result.error }); return; }
    setReviewOpen(false);
    reviewForm.reset({ decision: "verified", reason: "" });
    setNotice({ tone: "success", message: `Account ${values.decision === "verified" ? "verified and activated" : "rejected"}.` });
    await refresh();
    setSelected(null);
  }

  async function submitStatus(values: StatusFields) {
    if (!selected) return;
    setIsSaving(true);
    setNotice(null);
    const result = await setCollectionAccountActive({ accountId: selected.id, activate: statusAction === "activate", reason: values.reason });
    setIsSaving(false);
    if (!result.success) { setNotice({ tone: "error", message: result.error }); return; }
    setStatusOpen(false);
    statusForm.reset({ reason: "" });
    setNotice({ tone: "success", message: `Account ${statusAction === "activate" ? "activated" : "deactivated"}.` });
    await refresh();
    setSelected(null);
  }

  async function submitDelete(values: StatusFields) {
    if (!selected) return;
    setIsSaving(true);
    setNotice(null);
    const result = await deleteCollectionAccount(selected.id, values.reason);
    setIsSaving(false);
    if (!result.success) { setNotice({ tone: "error", message: result.error }); return; }
    setDeleteOpen(false);
    deleteForm.reset({ reason: "" });
    setNotice({ tone: "success", message: "Account removed." });
    await refresh();
    setSelected(null);
  }

  async function openTransactions(acc: CollectionAccount) {
    setTxOpen(true);
    setTxLoading(true);
    const result = await getAccountPayments(acc.id);
    setTxLoading(false);
    if (result.success) setTransactions(result.data);
  }

  return (
    <main className="grid gap-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">RRA Collection Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Manage official bank accounts and Mobile Money channels that receive tax payments through TaxFlow.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setRegisterOpen(true)}>
            <PlusCircle className="size-4" /> Register Account
          </Button>
        )}
      </header>

      {notice && (
        <p role="status" className={`rounded-md border px-4 py-3 text-sm ${notice.tone === "error" ? "border-destructive/40 text-destructive" : "border-emerald-600/40 text-emerald-700"}`}>
          {notice.message}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total accounts", value: summary.total, sub: null },
          { label: "Verified", value: summary.verified, sub: null },
          { label: "Active", value: summary.active, sub: null },
          { label: "Pending review", value: summary.pending, sub: null },
          { label: "Total collected", value: money(summary.totalCollectedRwf), sub: "confirmed payments" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl">{s.value}</CardTitle>
            </CardHeader>
            {s.sub && <CardContent className="text-xs text-muted-foreground">{s.sub}</CardContent>}
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "verified", "active", "inactive"] as const).map((f) => (
          <Button key={f} size="sm" variant={filterStatus === f ? "default" : "outline"} onClick={() => setFilterStatus(f)} className="capitalize">
            {f}
          </Button>
        ))}
      </div>

      {/* Account list */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="grid min-h-40 place-items-center text-sm text-muted-foreground">
              No collection accounts found.
            </CardContent>
          </Card>
        )}
        {filtered.map((acc) => (
          <Card key={acc.id} className="relative">
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {acc.accountType === "bank_account"
                    ? <Building2 className="size-4 text-muted-foreground" />
                    : <Smartphone className="size-4 text-muted-foreground" />}
                  <CardTitle className="text-sm font-semibold leading-tight">{acc.displayName}</CardTitle>
                </div>
                {statusBadge(acc)}
              </div>
              <CardDescription className="text-xs">
                {acc.providerName}
                {acc.accountType === "bank_account" && acc.maskedAccountNumber ? ` · ${acc.maskedAccountNumber}` : ""}
                {acc.accountType === "mobile_money" && acc.merchantCode ? ` · ${acc.merchantCode}` : ""}
                {" · "}{acc.currency}
              </CardDescription>
              {acc.description && <p className="text-xs text-muted-foreground">{acc.description}</p>}
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Registered {fmt(acc.createdAt)}</span>
                {acc.verifiedAt && <span>· Verified {fmt(acc.verifiedAt)}</span>}
                {acc.totalPayments > 0 && (
                  <span>· {acc.totalPayments} payment{acc.totalPayments !== 1 ? "s" : ""} · {money(acc.totalCollectedRwf)}</span>
                )}
              </div>
              {acc.rejectionReason && (
                <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{acc.rejectionReason}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {/* Review button */}
                {canReview && ["pending", "reverification_required"].includes(acc.verificationStatus) && acc.submittedBy !== "self" && (
                  <Button size="sm" variant="default" onClick={() => { setSelected(acc); reviewForm.reset({ decision: "verified", reason: "" }); setReviewOpen(true); }}>
                    <ShieldCheck className="size-3" /> Review
                  </Button>
                )}
                {/* Activate / Deactivate */}
                {canManage && acc.verificationStatus === "verified" && (
                  <Button size="sm" variant={acc.isActive ? "outline" : "default"}
                    onClick={() => {
                      setSelected(acc);
                      setStatusAction(acc.isActive ? "deactivate" : "activate");
                      statusForm.reset({ reason: "" });
                      setStatusOpen(true);
                    }}>
                    {acc.isActive ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
                    {acc.isActive ? "Deactivate" : "Activate"}
                  </Button>
                )}
                {/* View transactions */}
                <Button size="sm" variant="outline" onClick={() => { setSelected(acc); openTransactions(acc); }}>
                  <Banknote className="size-3" /> Transactions
                </Button>
                {/* Delete */}
                {canManage && !acc.isActive && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { setSelected(acc); deleteForm.reset({ reason: "" }); setDeleteOpen(true); }}>
                    Remove
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Register Dialog ─────────────────────────────────────── */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register Collection Account</DialogTitle>
            <DialogDescription>
              The account will start as pending verification. An authorized reviewer must approve it before payments can be directed to it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Account type</Label>
            <Select value={registerType} onValueChange={(v) => setRegisterType(v as "bank_account" | "mobile_money")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_account"><Building2 className="inline size-4 mr-1" />Bank account</SelectItem>
                <SelectItem value="mobile_money"><Smartphone className="inline size-4 mr-1" />Mobile Money channel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {registerType === "bank_account" ? (
            <form className="grid gap-3" onSubmit={bankForm.handleSubmit((v) => submitRegister(v))}>
              {[
                { id: "displayName", label: "Display name", ph: "e.g. BK Main Collection Account" },
                { id: "providerName", label: "Bank name", ph: "e.g. Bank of Kigali" },
                { id: "bankAccountHolder", label: "Account holder name", ph: "Rwanda Revenue Authority" },
                { id: "bankAccountNumber", label: "Account number", ph: "" },
                { id: "bankBranch", label: "Branch (optional)", ph: "" },
                { id: "providerIntegration", label: "Provider integration key (optional)", ph: "" },
                { id: "currency", label: "Currency", ph: "RWF" },
                { id: "description", label: "Description (optional)", ph: "" },
              ].map(({ id, label, ph }) => (
                <div key={id} className="grid gap-1.5">
                  <Label htmlFor={`bank-${id}`}>{label}</Label>
                  <Input id={`bank-${id}`} placeholder={ph} {...bankForm.register(id as keyof BankFields)} />
                  {bankForm.formState.errors[id as keyof BankFields] && (
                    <p className="text-xs text-destructive">{bankForm.formState.errors[id as keyof BankFields]?.message}</p>
                  )}
                </div>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null} Submit for verification</Button>
              </DialogFooter>
            </form>
          ) : (
            <form className="grid gap-3" onSubmit={momoForm.handleSubmit((v) => submitRegister(v))}>
              {[
                { id: "displayName", label: "Display name", ph: "e.g. MTN MoMo Collection Channel" },
                { id: "providerName", label: "Provider name", ph: "e.g. MTN Rwanda" },
                { id: "merchantCode", label: "Merchant code / Collection number", ph: "" },
                { id: "registeredName", label: "Registered account name", ph: "Rwanda Revenue Authority" },
                { id: "providerIntegration", label: "Provider integration key (optional)", ph: "" },
                { id: "currency", label: "Currency", ph: "RWF" },
                { id: "description", label: "Description (optional)", ph: "" },
              ].map(({ id, label, ph }) => (
                <div key={id} className="grid gap-1.5">
                  <Label htmlFor={`momo-${id}`}>{label}</Label>
                  <Input id={`momo-${id}`} placeholder={ph} {...momoForm.register(id as keyof MomoFields)} />
                  {momoForm.formState.errors[id as keyof MomoFields] && (
                    <p className="text-xs text-destructive">{momoForm.formState.errors[id as keyof MomoFields]?.message}</p>
                  )}
                </div>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null} Submit for verification</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Review Dialog ───────────────────────────────────────── */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Collection Account</DialogTitle>
            <DialogDescription>
              {selected?.displayName} — {selected?.providerName}. You cannot review an account you submitted.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={reviewForm.handleSubmit(submitReview)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant={watchDecision === "verified" ? "default" : "outline"}
                onClick={() => reviewForm.setValue("decision", "verified")}>
                <ShieldCheck className="size-4" /> Approve & verify
              </Button>
              <Button type="button" variant={watchDecision === "rejected" ? "destructive" : "outline"}
                onClick={() => reviewForm.setValue("decision", "rejected")}>
                <ShieldX className="size-4" /> Reject
              </Button>
            </div>
            {watchDecision === "rejected" && (
              <div className="grid gap-1.5">
                <Label htmlFor="rejection-reason">Rejection reason</Label>
                <Textarea id="rejection-reason" rows={2} {...reviewForm.register("rejectionReason")} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="review-reason">Mandatory audit reason</Label>
              <Textarea id="review-reason" rows={3} {...reviewForm.register("reason")} />
              {reviewForm.formState.errors.reason && (
                <p className="text-xs text-destructive">{reviewForm.formState.errors.reason.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
              <Button type="submit" variant={watchDecision === "rejected" ? "destructive" : "default"} disabled={isSaving}>
                {isSaving ? "Submitting…" : watchDecision === "verified" ? "Approve account" : "Reject account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Activate / Deactivate Dialog ────────────────────────── */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusAction === "activate" ? "Activate" : "Deactivate"} Account</DialogTitle>
            <DialogDescription>
              {statusAction === "activate"
                ? "Activating will make this account available as a payment destination for taxpayers."
                : "Deactivating will prevent new payments from being directed to this account. Historical records are preserved."}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={statusForm.handleSubmit(submitStatus)}>
            <div className="grid gap-1.5">
              <Label htmlFor="status-reason">Mandatory audit reason</Label>
              <Textarea id="status-reason" rows={3} {...statusForm.register("reason")} />
              {statusForm.formState.errors.reason && (
                <p className="text-xs text-destructive">{statusForm.formState.errors.reason.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
              <Button type="submit" variant={statusAction === "deactivate" ? "destructive" : "default"} disabled={isSaving}>
                {isSaving ? "Applying…" : statusAction === "activate" ? "Activate account" : "Deactivate account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ───────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Account</DialogTitle>
            <DialogDescription>
              This permanently removes the account record. Only accounts with no linked payments can be removed.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={deleteForm.handleSubmit(submitDelete)}>
            <div className="grid gap-1.5">
              <Label htmlFor="delete-reason">Mandatory audit reason</Label>
              <Textarea id="delete-reason" rows={3} {...deleteForm.register("reason")} />
              {deleteForm.formState.errors.reason && (
                <p className="text-xs text-destructive">{deleteForm.formState.errors.reason.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={isSaving}>
                {isSaving ? "Removing…" : "Remove account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Transactions Dialog ─────────────────────────────────── */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Transactions — {selected?.displayName}</DialogTitle>
            <DialogDescription>Latest 200 confirmed and pending payments directed to this account.</DialogDescription>
          </DialogHeader>
          {txLoading ? (
            <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin" /></div>
          ) : transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions found for this account.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3">Trader</th>
                    <th className="pb-2 pr-3">Amount</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{tx.businessName || tx.traderName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{tx.method}</span>
                      </td>
                      <td className="py-2 pr-3 font-mono font-semibold">{money(tx.amount)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={tx.status === "confirmed" ? "default" : tx.status === "rejected" ? "destructive" : "secondary"} className="capitalize text-xs">
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{fmt(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
