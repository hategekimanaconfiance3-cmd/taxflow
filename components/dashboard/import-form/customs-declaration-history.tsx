"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitImportArrival } from "@/lib/actions/import.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2 } from "lucide-react";

type Declaration = {
    id: string; productName: string; productUnit: string; expectedQuantity: number;
    actualQuantity: number | null; inspectedQuantity: number | null; status: string;
    originCountry: string | null; supplierName: string | null; expectedReturnDate: string | null;
    estimatedValue: number | null; currency: string; customsRef: string | null;
    invoiceRef: string | null; supportingDoc: string | null; inspectionNote: string | null;
};

export function CustomsDeclarationHistory({ declarations }: { declarations: Declaration[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [values, setValues] = useState<Record<string, { quantity: string; invoice: string; docs: string }>>({});
    const [messages, setMessages] = useState<Record<string, string>>({});

    function current(id: string) {
        return values[id] ?? { quantity: "", invoice: "", docs: "" };
    }

    function submit(d: Declaration) {
        const value = current(d.id);
        const quantity = Number(value.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || !value.invoice.trim() || !value.docs.trim()) {
            setMessages((old) => ({ ...old, [d.id]: "Enter a valid quantity, invoice/reference, and supporting document description." }));
            return;
        }
        startTransition(async () => {
            try {
                setMessages((old) => ({ ...old, [d.id]: "" }));
                await submitImportArrival(d.id, { actualQuantity: quantity, invoiceRef: value.invoice.trim(), supportingDoc: value.docs.trim() });
                setMessages((old) => ({ ...old, [d.id]: "Arrival submitted. Awaiting RRA customs inspection and confirmation." }));
                router.refresh();
            } catch (error) {
                setMessages((old) => ({ ...old, [d.id]: error instanceof Error ? error.message : "Could not submit arrival details." }));
            }
        });
    }

    const labels: Record<string, string> = { pending: "Awaiting return", submitted: "Awaiting RRA inspection", activated: "Customs cleared", rejected: "Flagged / rejected" };
    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> My Customs Declarations</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {declarations.length === 0 ? <p className="text-sm text-muted-foreground">Your declarations will appear here after you create one.</p> : declarations.map((d) => {
                    const v = current(d.id);
                    return (
                        <div key={d.id} className="space-y-3 rounded-lg border p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <p className="font-medium">{d.productName}</p>
                                    <p className="text-sm text-muted-foreground">Expected: {d.expectedQuantity.toLocaleString()} {d.productUnit}{d.originCountry ? ` · ${d.originCountry}` : ""}{d.expectedReturnDate ? ` · Return ${d.expectedReturnDate}` : ""}</p>
                                    {d.supplierName && <p className="text-xs text-muted-foreground">Supplier: {d.supplierName}</p>}
                                    {d.estimatedValue != null && <p className="text-xs text-muted-foreground">Estimated value: {d.estimatedValue.toLocaleString()} {d.currency}</p>}
                                </div>
                                <Badge variant={d.status === "activated" ? "outline" : d.status === "rejected" ? "destructive" : "secondary"}>{labels[d.status] ?? d.status}</Badge>
                            </div>
                            {d.status === "pending" && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor={`arrival-qty-${d.id}`}>Quantity you actually brought back</Label>
                                        <Input id={`arrival-qty-${d.id}`} type="number" min={1} step="any" value={v.quantity} onChange={(e) => setValues((old) => ({ ...old, [d.id]: { ...current(d.id), quantity: e.target.value } }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor={`arrival-invoice-${d.id}`}>Invoice / purchase reference</Label>
                                        <Input id={`arrival-invoice-${d.id}`} value={v.invoice} onChange={(e) => setValues((old) => ({ ...old, [d.id]: { ...current(d.id), invoice: e.target.value } }))} maxLength={200} />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label htmlFor={`arrival-docs-${d.id}`}>Supporting documents</Label>
                                        <Textarea id={`arrival-docs-${d.id}`} value={v.docs} onChange={(e) => setValues((old) => ({ ...old, [d.id]: { ...current(d.id), docs: e.target.value } }))} placeholder="Describe invoice, receipt, or other supporting document (upload support can be added separately)." rows={2} maxLength={1000} />
                                    </div>
                                    {messages[d.id] && <p className="text-sm text-muted-foreground sm:col-span-2">{messages[d.id]}</p>}
                                    <div className="sm:col-span-2"><Button onClick={() => submit(d)} disabled={pending} className="gap-2">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Submit arrival for RRA inspection</Button></div>
                                </div>
                            )}
                            {d.status !== "pending" && <div className="text-sm text-muted-foreground">{d.actualQuantity != null && <>Merchant reported: {d.actualQuantity.toLocaleString()} {d.productUnit}. </>}{d.inspectedQuantity != null && <>RRA inspected: {d.inspectedQuantity.toLocaleString()} {d.productUnit}. </>}{d.inspectionNote && <>RRA note: {d.inspectionNote}</>}</div>}
                            {messages[d.id] && d.status !== "pending" && <p className="text-sm text-muted-foreground">{messages[d.id]}</p>}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
