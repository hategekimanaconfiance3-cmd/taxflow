"use client";

import { useState, useTransition } from "react";
import {
  Smartphone,
  Landmark,
  Plus,
  Trash2,
  Star,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  savePaymentMethod,
  setDefaultPaymentMethod,
  removePaymentMethod,
  updatePaymentMethodLabel,
  type SavedPaymentMethod,
  type PaymentMethodProvider,
} from "@/lib/actions/payment-method.action";
import { useRouter } from "next/navigation";

const PROVIDER_OPTIONS: { value: PaymentMethodProvider; label: string; icon: React.ReactNode }[] = [
  { value: "mtn_mobile_money", label: "MTN Mobile Money", icon: <Smartphone className="h-4 w-4" /> },
  { value: "airtel_money", label: "Airtel Money", icon: <Smartphone className="h-4 w-4" /> },
  { value: "bank_transfer", label: "Bank Transfer", icon: <Landmark className="h-4 w-4" /> },
];

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "bank_transfer") return <Landmark className="h-4 w-4" />;
  return <Smartphone className="h-4 w-4" />;
}

function ProviderBadge({ provider }: { provider: string }) {
  const opt = PROVIDER_OPTIONS.find((p) => p.value === provider);
  return (
    <Badge variant="outline" className="text-[10px] capitalize gap-1">
      {opt?.icon}
      {opt?.label ?? provider}
    </Badge>
  );
}

interface PaymentMethodManagerProps {
  initialMethods: SavedPaymentMethod[];
}

export function PaymentMethodManager({ initialMethods }: PaymentMethodManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addProvider, setAddProvider] = useState<PaymentMethodProvider>("mtn_mobile_money");
  const [addIdentifier, setAddIdentifier] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addDefault, setAddDefault] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Edit label dialog
  const [editTarget, setEditTarget] = useState<SavedPaymentMethod | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editError, setEditError] = useState("");

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState<SavedPaymentMethod | null>(null);

  // Action feedback
  const [actionError, setActionError] = useState("");

  const methods = initialMethods; // parent refreshes via router.refresh()

  async function handleAdd() {
    setAddError("");
    setIsAdding(true);
    try {
      const result = await savePaymentMethod({
        provider: addProvider,
        identifier: addIdentifier.trim(),
        label: addLabel.trim() || undefined,
        makeDefault: addDefault,
      });
      if (!result.success) {
        setAddError(result.error);
        return;
      }
      setAddSuccess(true);
      setTimeout(() => {
        setAddOpen(false);
        setAddSuccess(false);
        setAddIdentifier("");
        setAddLabel("");
        setAddDefault(false);
        router.refresh();
      }, 800);
    } catch {
      setAddError("Could not save payment method. Please try again.");
    } finally {
      setIsAdding(false);
    }
  }

  function handleSetDefault(id: string) {
    setActionError("");
    startTransition(async () => {
      const result = await setDefaultPaymentMethod(id);
      if (!result.success) setActionError(result.error);
      else router.refresh();
    });
  }

  async function handleRemove(id: string) {
    setActionError("");
    const result = await removePaymentMethod(id);
    if (!result.success) setActionError(result.error);
    else {
      setRemoveTarget(null);
      router.refresh();
    }
  }

  async function handleEditLabel() {
    if (!editTarget) return;
    setEditError("");
    const result = await updatePaymentMethodLabel({ id: editTarget.id, label: editLabel });
    if (!result.success) {
      setEditError(result.error);
      return;
    }
    setEditTarget(null);
    router.refresh();
  }

  const identifierPlaceholder =
    addProvider === "bank_transfer" ? "Account number" : "+250 78 000 0000";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            My Payment Methods
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => { setAddOpen(true); setAddError(""); setAddSuccess(false); }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Method
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actionError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {actionError}
          </div>
        )}

        {methods.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed px-4 py-8 text-center">
            <Landmark className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No saved payment methods</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Save a Mobile Money number or bank account to pay faster.
            </p>
            <Button
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => { setAddOpen(true); setAddError(""); }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Your First Method
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {methods.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <ProviderIcon provider={m.provider} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {m.label ?? m.providerLabel}
                    </span>
                    {m.isDefault && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <Star className="h-2.5 w-2.5" fill="currentColor" />
                        Default
                      </span>
                    )}
                    <ProviderBadge provider={m.provider} />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{m.maskedIdentifier}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!m.isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Set as default"
                      disabled={isPending}
                      onClick={() => handleSetDefault(m.id)}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Edit label"
                    onClick={() => { setEditTarget(m); setEditLabel(m.label ?? ""); setEditError(""); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                    title="Remove"
                    onClick={() => setRemoveTarget(m)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Payment account numbers are masked for display. Up to 10 saved methods per account.
        </p>
      </CardContent>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
            <DialogDescription>
              Save a mobile money number or bank account to use when paying your taxes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {addSuccess ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="font-medium">Payment method saved!</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select
                    value={addProvider}
                    onValueChange={(v) => setAddProvider(v as PaymentMethodProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <span className="flex items-center gap-2">
                            {p.icon} {p.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {addProvider === "bank_transfer" ? "Account Number" : "Phone Number"}
                  </Label>
                  <Input
                    value={addIdentifier}
                    onChange={(e) => setAddIdentifier(e.target.value)}
                    placeholder={identifierPlaceholder}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Will be masked when displayed (e.g. +250 78* *** 456).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Nickname{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    placeholder='e.g. "My MTN", "Office Account"'
                    maxLength={50}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="set-default"
                    type="checkbox"
                    checked={addDefault}
                    onChange={(e) => setAddDefault(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="set-default" className="cursor-pointer text-sm font-normal">
                    Set as default payment method
                  </Label>
                </div>
                {addError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {addError}
                  </div>
                )}
              </>
            )}
          </div>
          {!addSuccess && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={isAdding || addIdentifier.trim().length < 7}
                className="gap-1.5"
              >
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save Method
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit label dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Edit Nickname</DialogTitle>
            <DialogDescription>
              {editTarget?.maskedIdentifier}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nickname</Label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="e.g. My MTN"
                maxLength={50}
              />
            </div>
            {editError && (
              <p className="text-sm text-red-600">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditLabel}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Remove Payment Method</DialogTitle>
            <DialogDescription>
              Remove <strong>{removeTarget?.maskedIdentifier}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && handleRemove(removeTarget.id)}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
