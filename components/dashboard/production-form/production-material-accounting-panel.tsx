"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PackageCheck } from "lucide-react";

interface Material {
  id: string;
  materialCode: string;
  name: string;
  unit: string;
  balance: string;
}

interface Receipt {
  id: string;
  materialCode: string;
  origin: string;
  sourceReference: string | null;
  evidenceReference: string;
  quantity: string;
  unit: string;
  status: string;
  createdAt: Date | string;
}

interface IncomingTransaction {
  id: string;
  sellerName: string | null;
  productName: string;
  unit: string;
  quantity: number;
  remainingQuantity: string;
  invoiceReference: string | null;
}

interface EligibleImport {
  id: string;
  materialId: string | null;
  materialCode: string;
  customsReference: string | null;
  inspectedQuantity: number | null;
  unit: string;
}

interface Props {
  materials: Material[];
  receipts: Receipt[];
  incomingTransactions: IncomingTransaction[];
  eligibleImports: EligibleImport[];
}

export function ProductionMaterialAccountingPanel({ materials, receipts, incomingTransactions, eligibleImports }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [materialId, setMaterialId] = useState("");
  const [origin, setOrigin] = useState<"import" | "domestic" | "opening_balance">("import");
  const [sourceId, setSourceId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const requestKey = useRef<string | null>(null);

  const selectedMaterial = materials.find((material) => material.id === materialId);
  const eligibleTransactions = incomingTransactions.filter((item) => Number(item.remainingQuantity) > 0);

  async function submitReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!materialId || !quantity || !evidenceReference.trim()) {
      setFeedback({ text: "Select a material, enter the quantity, and add an evidence reference.", error: true });
      return;
    }
    if ((origin === "import" || origin === "domestic") && !sourceId) {
      setFeedback({ text: origin === "import" ? "Select an activated import declaration." : "Select a confirmed incoming transaction.", error: true });
      return;
    }

    requestKey.current ??= crypto.randomUUID();
    const body = {
      materialId,
      origin,
      quantity: Number(quantity),
      evidenceReference: evidenceReference.trim(),
      supplierReference: supplierReference.trim() || undefined,
      idempotencyKey: requestKey.current,
      ...(origin === "import" ? { importDeclarationId: sourceId } : {}),
      ...(origin === "domestic" ? { transactionId: sourceId } : {}),
    };
    startTransition(async () => {
      try {
        const response = await fetch("/api/production/material-accounting", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) {
          setFeedback({ text: result.error ?? "Unable to submit material evidence.", error: true });
          return;
        }
        setFeedback({ text: "Receipt submitted for independent verification. It is not available in material stock yet.", error: false });
        requestKey.current = null;
        setQuantity("");
        setSupplierReference("");
        setEvidenceReference("");
        setSourceId("");
        router.refresh();
      } catch {
        setFeedback({ text: "Could not submit receipt evidence. Check your connection and retry.", error: true });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="h-4 w-4" /> Confidential material ledger</CardTitle>
        <p className="text-sm text-muted-foreground">Verified receipts add to this separate ledger. Pending evidence does not increase available material stock.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {materials.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Create a confidential recipe first. Its materials will appear in this ledger.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((material) => (
              <div key={material.id} className="rounded-lg border p-3">
                <p className="font-medium">{material.name} <span className="font-mono text-xs text-muted-foreground">({material.materialCode})</span></p>
                <p className="mt-1 text-sm text-muted-foreground">Available: <span className="font-mono text-foreground">{material.balance} {material.unit}</span></p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(event) => void submitReceipt(event)} className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <div>
            <h3 className="font-medium">Submit receipt evidence</h3>
            <p className="mt-1 text-xs text-muted-foreground">Imports require recorded RRA inspection. Domestic receipts require a confirmed incoming B2B transaction. Opening balances require evidence and officer verification.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="material-receipt-material">Confidential material</Label>
              <select id="material-receipt-material" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={materialId} onChange={(event) => { setMaterialId(event.target.value); setSourceId(""); requestKey.current = null; }} required>
                <option value="">Choose a material</option>
                {materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.materialCode}) · {material.unit}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material-receipt-origin">Receipt origin</Label>
              <select id="material-receipt-origin" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={origin} onChange={(event) => { setOrigin(event.target.value as typeof origin); setSourceId(""); requestKey.current = null; }}>
                <option value="import">Imported material</option>
                <option value="domestic">Domestic B2B purchase</option>
                <option value="opening_balance">Verified opening balance</option>
              </select>
            </div>
            {origin === "import" && (
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="material-receipt-import">Activated import declaration</Label>
                <select id="material-receipt-import" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sourceId} onChange={(event) => { setSourceId(event.target.value); requestKey.current = null; }}>
                  <option value="">Choose an activated import</option>
                  {eligibleImports.filter((item) => item.materialId === materialId).map((item) => <option key={item.id} value={item.id}>{item.customsReference ?? item.id} · inspected {item.inspectedQuantity ?? 0} {item.unit}</option>)}
                </select>
                {eligibleImports.filter((item) => item.materialId === materialId).length === 0 && <p className="text-xs text-muted-foreground">No unused activated import declarations are linked to this material. RRA arrival reviews normally post their verified material receipt directly.</p>}
              </div>
            )}
            {origin === "domestic" && (
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="material-receipt-transaction">Confirmed incoming transaction</Label>
                <select id="material-receipt-transaction" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sourceId} onChange={(event) => { setSourceId(event.target.value); requestKey.current = null; }}>
                  <option value="">Choose a confirmed purchase</option>
                  {eligibleTransactions.filter((item) => !selectedMaterial || item.unit.trim().toLocaleLowerCase() === selectedMaterial.unit.trim().toLocaleLowerCase()).map((item) => (
                    <option key={item.id} value={item.id}>{item.sellerName ?? "Supplier"} · {item.productName} · remaining {item.remainingQuantity} {item.unit}{item.invoiceReference ? ` · ${item.invoiceReference}` : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="material-receipt-quantity">Quantity received {selectedMaterial ? `(${selectedMaterial.unit})` : ""}</Label>
              <Input id="material-receipt-quantity" type="number" min="0.000001" step="0.000001" value={quantity} onChange={(event) => { setQuantity(event.target.value); requestKey.current = null; }} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material-receipt-supplier">Supplier/reference (optional)</Label>
              <Input id="material-receipt-supplier" value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} maxLength={160} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="material-receipt-evidence">Evidence reference</Label>
              <Input id="material-receipt-evidence" value={evidenceReference} onChange={(event) => { setEvidenceReference(event.target.value); requestKey.current = null; }} placeholder="Invoice, delivery note, or verified opening-balance record" maxLength={500} required />
            </div>
          </div>
          {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-emerald-700"}>{feedback.text}</p>}
          <Button type="submit" disabled={pending || materials.length === 0}>{pending && <Loader2 className="animate-spin" data-icon="inline-start" />}Submit for verification</Button>
        </form>

        <div className="space-y-2">
          <h3 className="font-medium">Recent receipt evidence</h3>
          {receipts.length === 0 ? <p className="text-sm text-muted-foreground">No material receipts are recorded.</p> : (
            <div className="divide-y rounded-md border">
              {receipts.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div><p className="font-medium">{receipt.materialCode} · {receipt.origin.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">Evidence: {receipt.evidenceReference} · {new Date(receipt.createdAt).toLocaleDateString()}</p></div>
                <div className="text-right"><p className="font-mono">{receipt.quantity} {receipt.unit}</p><p className={receipt.status === "verified" ? "text-xs text-emerald-700" : receipt.status === "rejected" ? "text-xs text-destructive" : "text-xs text-amber-700"}>{receipt.status}</p></div>
              </div>)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
