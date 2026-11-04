"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  FileText,
  Receipt,
  CreditCard,
  Package,
  Factory,
  Ship,
  Scale,
  Briefcase,
  History,
  Edit,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronDown,
  X,
  Save,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { editMerchantProfile } from "@/lib/actions/merchant-profile.action";
import type {
  MerchantProfileData,
  MerchantProfile,
  MerchantPermissions,
  MerchantFinancial,
  MerchantVatRecord,
  MerchantTransaction,
  MerchantPayment,
  MerchantStockItem,
  MerchantStockMovement,
  MerchantProductionBatch,
  MerchantImport,
  MerchantDispute,
  MerchantCase,
  MerchantSupportTicket,
  MerchantAuditEntry,
} from "@/lib/actions/merchant-profile.action";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const money = (n: number) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    approved: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    active: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    completed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    resolved: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    closed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    pending: "bg-amber-500/10 text-amber-700 border-amber-200",
    filed: "bg-amber-500/10 text-amber-700 border-amber-200",
    open: "bg-amber-500/10 text-amber-700 border-amber-200",
    under_review: "bg-orange-500/10 text-orange-700 border-orange-200",
    acknowledged: "bg-blue-500/10 text-blue-700 border-blue-200",
    suspended: "bg-red-500/10 text-red-700 border-red-200",
    dismissed: "bg-red-500/10 text-red-700 border-red-200",
    rejected: "bg-red-500/10 text-red-700 border-red-200",
    failed: "bg-red-500/10 text-red-700 border-red-200",
  };
  return (
    <Badge
      variant="outline"
      className={`capitalize text-[10px] ${cfg[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function PermissionTag({
  allowed,
  label,
}: {
  allowed: boolean;
  label: string;
}) {
  if (!allowed) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
      <CheckCircle className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground py-6 text-center">{message}</p>
  );
}

// ---------------------------------------------------------------------------
// Edit profile dialog
// ---------------------------------------------------------------------------

function EditProfileDialog({
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: MerchantProfile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [businessName, setBusinessName] = useState(
    profile.businessName ?? "",
  );
  const [phone, setPhone] = useState(profile.phoneNumber ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!reason.trim() || reason.trim().length < 10) {
      setError("Provide a reason of at least 10 characters.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const result = await editMerchantProfile(
          profile.id,
          { name, businessName, phoneNumber: phone, email },
          reason,
        );
        if (result.success) {
          onSaved();
          onOpenChange(false);
        } else {
          setError(result.error ?? "Save failed.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "An unexpected error occurred.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Merchant Information</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Merchant:{" "}
            <span className="font-semibold">
              {profile.businessName ?? profile.name}
            </span>
            {profile.tinNumber && (
              <span className="ml-2 font-mono text-muted-foreground">
                TIN: {profile.tinNumber}
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Contact name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Business name</Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">
              Reason for change <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this information is being changed (min 10 characters)…"
              className="text-sm resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              This reason will be recorded in the immutable audit log.
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save change
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  profile,
  financial,
  permissions,
  onEdit,
}: {
  profile: MerchantProfile;
  financial?: MerchantFinancial;
  permissions: MerchantPermissions;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Identity card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {profile.businessName ?? profile.name}
              </CardTitle>
              {profile.businessName && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Badge className="capitalize bg-primary/10 text-primary border-0">
                {profile.role}
              </Badge>
              {profile.clearanceStatus && (
                <StatusBadge status={profile.clearanceStatus} />
              )}
              {permissions.canEditProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={onEdit}
                >
                  <Edit className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">TIN</p>
              <p className="font-mono font-semibold">
                {profile.tinNumber ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Registered</p>
              <p>{fmtDate(profile.registeredAt)}</p>
            </div>
            {profile.phoneNumber !== undefined && (
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p>{profile.phoneNumber || "—"}</p>
              </div>
            )}
            {profile.email !== undefined && (
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="break-all">{profile.email || "—"}</p>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground">
                Last updated: {fmtDateTime(profile.updatedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial summary */}
      {financial && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">VAT Output</p>
              <p className="text-xl font-bold mt-1">
                {money(financial.vatOutput)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Total output VAT generated
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Payments Confirmed</p>
              <p className="text-xl font-bold mt-1 text-emerald-600">
                {money(financial.confirmedPayments)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {financial.paymentCount} confirmed payment
                {financial.paymentCount !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p
                className={`text-xl font-bold mt-1 ${financial.outstanding > 0 ? "text-destructive" : "text-emerald-600"}`}
              >
                {money(financial.outstanding)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Net VAT due: {money(financial.netVatDue)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Authorized module access summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Your Access to This Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <PermissionTag
              allowed={permissions.canViewTax}
              label="Tax & VAT"
            />
            <PermissionTag
              allowed={permissions.canViewTransactions}
              label="Transactions"
            />
            <PermissionTag
              allowed={permissions.canViewPayments}
              label="Payments"
            />
            <PermissionTag
              allowed={permissions.canReconcilePayments}
              label="Reconcile Payments"
            />
            <PermissionTag
              allowed={permissions.canViewStock}
              label="Stock & Production"
            />
            <PermissionTag
              allowed={permissions.canCorrectStock}
              label="Stock Corrections"
            />
            <PermissionTag
              allowed={permissions.canViewImports}
              label="Imports"
            />
            <PermissionTag
              allowed={permissions.canReviewImports}
              label="Review Imports"
            />
            <PermissionTag
              allowed={permissions.canManageDisputes}
              label="Disputes"
            />
            <PermissionTag
              allowed={permissions.canManageCases}
              label="Investigation Cases"
            />
            <PermissionTag
              allowed={permissions.canViewAuditTrail}
              label="Audit Trail"
            />
            <PermissionTag
              allowed={permissions.canManageSupport}
              label="Support Tickets"
            />
            <PermissionTag
              allowed={permissions.canEditProfile}
              label="Edit Profile"
            />
          </div>
          {!Object.values(permissions).some(Boolean) && (
            <p className="text-xs text-muted-foreground">
              Your role has view-only access to basic profile information.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tax & VAT tab
// ---------------------------------------------------------------------------

function TaxTab({
  financial,
  vatRecords,
}: {
  financial?: MerchantFinancial;
  vatRecords?: MerchantVatRecord[];
}) {
  return (
    <div className="space-y-6">
      {financial && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Output VAT",
              value: money(financial.vatOutput),
              icon: TrendingUp,
              cls: "text-foreground",
            },
            {
              label: "Input VAT",
              value: money(financial.vatInput),
              icon: TrendingDown,
              cls: "text-foreground",
            },
            {
              label: "Net VAT Due",
              value: money(financial.netVatDue),
              icon: Minus,
              cls: "text-foreground",
            },
            {
              label: "Outstanding",
              value: money(financial.outstanding),
              icon: AlertCircle,
              cls:
                financial.outstanding > 0
                  ? "text-destructive"
                  : "text-emerald-600",
            },
          ].map(({ label, value, icon: Icon, cls }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
                <p className={`text-lg font-bold ${cls}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {vatRecords && vatRecords.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">VAT Records</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount (RWF)</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vatRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize text-[10px] ${r.vatType === "output" ? "text-blue-700 border-blue-200" : "text-purple-700 border-purple-200"}`}
                      >
                        {r.vatType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.period ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {money(r.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(r.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState message="No VAT records visible to your role." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transactions tab
// ---------------------------------------------------------------------------

function TransactionsTab({
  transactions,
}: {
  transactions?: MerchantTransaction[];
}) {
  if (!transactions?.length)
    return <EmptyState message="No transactions visible to your role." />;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Transactions ({transactions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm font-medium">
                  {r.productName}
                </TableCell>
                <TableCell className="text-right text-sm">{r.quantity}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {money(r.totalAmount)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {money(r.vatAmount)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payments tab
// ---------------------------------------------------------------------------

function PaymentsTab({ payments }: { payments?: MerchantPayment[] }) {
  if (!payments?.length)
    return <EmptyState message="No payments visible to your role." />;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Payments ({payments.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-right font-mono font-semibold">
                  {money(r.amount)}
                </TableCell>
                <TableCell className="text-xs capitalize">
                  {r.method.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.reference ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stock tab
// ---------------------------------------------------------------------------

function StockTab({
  stock,
  stockMovements,
}: {
  stock?: MerchantStockItem[];
  stockMovements?: MerchantStockMovement[];
}) {
  const [view, setView] = useState<"stock" | "movements">("stock");
  if (!stock?.length && !stockMovements?.length)
    return <EmptyState message="No stock records visible to your role." />;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={view === "stock" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setView("stock")}
        >
          Current Stock
        </Button>
        <Button
          variant={view === "movements" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setView("movements")}
        >
          Movements
        </Button>
      </div>

      {view === "stock" && stock && stock.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">
                      {r.productName}
                    </TableCell>
                    <TableCell className="text-xs">{r.unit}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.price != null ? money(r.price) : "—"}
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">
                      {r.source ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {view === "movements" && stockMovements && stockMovements.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockMovements.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">
                      {r.productName}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.movementType} />
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-semibold ${r.quantityDelta >= 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {r.quantityDelta >= 0 ? "+" : ""}
                      {r.quantityDelta}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {r.quantityBefore}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.quantityAfter}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                      {r.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(r.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Production tab
// ---------------------------------------------------------------------------

function ProductionTab({
  production,
}: {
  production?: MerchantProductionBatch[];
}) {
  if (!production?.length)
    return (
      <EmptyState message="No production records visible to your role." />
    );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Production Batches ({production.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch Ref</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Validation</TableHead>
              <TableHead>Period</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {production.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {r.batchReference}
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {r.productName}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.quantity}
                </TableCell>
                <TableCell>
                  {r.status ? (
                    <StatusBadge status={r.status} />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.validationStatus} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Imports tab
// ---------------------------------------------------------------------------

function ImportsTab({ imports }: { imports?: MerchantImport[] }) {
  if (!imports?.length)
    return (
      <EmptyState message="No import declarations visible to your role." />
    );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Import Declarations ({imports.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead>Customs Ref</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {r.declarationRef ?? "—"}
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {r.productName}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.expectedQuantity}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.actualQuantity ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.customsRef ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Disputes tab
// ---------------------------------------------------------------------------

function DisputesTab({ disputes }: { disputes?: MerchantDispute[] }) {
  if (!disputes?.length)
    return <EmptyState message="No disputes visible to your role." />;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Disputes ({disputes.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Filed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disputes.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {r.referenceNumber}
                </TableCell>
                <TableCell className="text-sm max-w-[280px] truncate">
                  {r.reason}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cases tab
// ---------------------------------------------------------------------------

function CasesTab({ cases }: { cases?: MerchantCase[] }) {
  if (!cases?.length)
    return (
      <EmptyState message="No investigation cases visible to your role." />
    );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Investigation Cases ({cases.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm font-medium max-w-[240px] truncate">
                  {r.title}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Support tickets tab
// ---------------------------------------------------------------------------

function SupportTab({
  supportTickets,
}: {
  supportTickets?: MerchantSupportTicket[];
}) {
  if (!supportTickets?.length)
    return <EmptyState message="No support tickets visible to your role." />;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Support Tickets ({supportTickets.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supportTickets.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm max-w-[280px] truncate">
                  {r.subject}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit trail tab
// ---------------------------------------------------------------------------

function AuditTrailTab({ auditHistory }: { auditHistory?: MerchantAuditEntry[] }) {
  if (!auditHistory?.length)
    return (
      <EmptyState message="No audit records visible to your role." />
    );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Audit Trail ({auditHistory.length} entries)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditHistory.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {r.action}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {r.targetType ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDateTime(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function MerchantProfileTabs({ data }: { data: MerchantProfileData }) {
  const { profile, permissions, financial, vatRecords, transactions, payments,
    stock, stockMovements, production, imports, disputes, cases,
    supportTickets, auditHistory } = data;

  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const hasStock = permissions.canViewStock && (stock?.length || stockMovements?.length || production?.length);
  const hasTax = permissions.canViewTax && (financial || vatRecords?.length);
  const hasImports = permissions.canViewImports && imports?.length;
  const hasEnforcement =
    (permissions.canManageDisputes && disputes?.length) ||
    (permissions.canManageCases && cases?.length);

  return (
    <>
      {permissions.canEditProfile && (
        <EditProfileDialog
          profile={profile}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <Tabs defaultValue="overview" className="space-y-4" key={refreshKey}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="min-h-9 flex-none">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          {hasTax && (
            <TabsTrigger value="tax" className="min-h-9 flex-none">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Tax & VAT
            </TabsTrigger>
          )}
          {permissions.canViewTransactions && (
            <TabsTrigger value="transactions" className="min-h-9 flex-none">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Transactions
            </TabsTrigger>
          )}
          {permissions.canViewPayments && (
            <TabsTrigger value="payments" className="min-h-9 flex-none">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Payments
            </TabsTrigger>
          )}
          {hasStock && (
            <TabsTrigger value="stock" className="min-h-9 flex-none">
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Stock
            </TabsTrigger>
          )}
          {permissions.canViewStock && production?.length ? (
            <TabsTrigger value="production" className="min-h-9 flex-none">
              <Factory className="h-3.5 w-3.5 mr-1.5" />
              Production
            </TabsTrigger>
          ) : null}
          {hasImports && (
            <TabsTrigger value="imports" className="min-h-9 flex-none">
              <Ship className="h-3.5 w-3.5 mr-1.5" />
              Imports
            </TabsTrigger>
          )}
          {hasEnforcement && (
            <TabsTrigger value="enforcement" className="min-h-9 flex-none">
              <Scale className="h-3.5 w-3.5 mr-1.5" />
              Disputes & Cases
            </TabsTrigger>
          )}
          {permissions.canManageSupport && supportTickets?.length ? (
            <TabsTrigger value="support" className="min-h-9 flex-none">
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />
              Support
            </TabsTrigger>
          ) : null}
          {permissions.canViewAuditTrail && auditHistory?.length ? (
            <TabsTrigger value="audit" className="min-h-9 flex-none">
              <History className="h-3.5 w-3.5 mr-1.5" />
              Audit Trail
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            profile={profile}
            financial={financial}
            permissions={permissions}
            onEdit={() => setEditOpen(true)}
          />
        </TabsContent>

        {hasTax && (
          <TabsContent value="tax">
            <TaxTab financial={financial} vatRecords={vatRecords} />
          </TabsContent>
        )}

        {permissions.canViewTransactions && (
          <TabsContent value="transactions">
            <TransactionsTab transactions={transactions} />
          </TabsContent>
        )}

        {permissions.canViewPayments && (
          <TabsContent value="payments">
            <PaymentsTab payments={payments} />
          </TabsContent>
        )}

        {permissions.canViewStock && (
          <TabsContent value="stock">
            <StockTab stock={stock} stockMovements={stockMovements} />
          </TabsContent>
        )}

        {permissions.canViewStock && (
          <TabsContent value="production">
            <ProductionTab production={production} />
          </TabsContent>
        )}

        {permissions.canViewImports && (
          <TabsContent value="imports">
            <ImportsTab imports={imports} />
          </TabsContent>
        )}

        {(permissions.canManageDisputes || permissions.canManageCases) && (
          <TabsContent value="enforcement">
            <div className="space-y-6">
              {permissions.canManageDisputes && (
                <div>
                  <SectionHeader icon={Scale} title="Disputes" />
                  <DisputesTab disputes={disputes} />
                </div>
              )}
              {permissions.canManageCases && (
                <div>
                  <SectionHeader icon={Briefcase} title="Investigation Cases" />
                  <CasesTab cases={cases} />
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {permissions.canManageSupport && (
          <TabsContent value="support">
            <SupportTab supportTickets={supportTickets} />
          </TabsContent>
        )}

        {permissions.canViewAuditTrail && (
          <TabsContent value="audit">
            <AuditTrailTab auditHistory={auditHistory} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
