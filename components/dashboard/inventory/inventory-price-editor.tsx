"use client";

import { useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InventoryPriceEditor({ productId, currentPrice }: { productId: string; currentPrice: number | null }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(currentPrice?.toString() ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const numericPrice = Number(price);
    if (!Number.isSafeInteger(numericPrice) || numericPrice <= 0) {
      setMessage("Enter a positive whole-number RWF price.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${productId}/price`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price: numericPrice, reason: reason.trim() || undefined, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json() as { error?: string; result?: { kind?: string } };
      if (!response.ok) throw new Error(body.error ?? "The price could not be updated.");
      setEditing(false);
      setReason("");
      setMessage(body.result?.kind === "changed" ? "Saved and recorded for transparency monitoring." : "Price saved.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The price could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) return (
    <div className="flex items-center justify-end gap-2">
      <span>{currentPrice === null ? "—" : `${currentPrice.toLocaleString()} RWF`}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Change selling price" onClick={() => { setPrice(currentPrice?.toString() ?? ""); setEditing(true); }}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {message ? <span className="sr-only">{message}</span> : null}
    </div>
  );

  return (
    <div className="flex min-w-[260px] flex-col items-end gap-2">
      <div className="flex items-center gap-1">
        <Input aria-label="New selling price in RWF" value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" className="h-8 w-32 text-right" />
        <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
      </div>
      <Input aria-label="Reason for price change" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (optional)" className="h-8 w-64 text-xs" />
      <p className="max-w-xs text-right text-[10px] text-muted-foreground">Price changes are recorded for transparency and monitoring.</p>
      {message ? <p className="text-right text-xs text-red-600">{message}</p> : null}
    </div>
  );
}

