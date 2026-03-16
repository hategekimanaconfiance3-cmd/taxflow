"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fileDispute } from "@/lib/actions/dispute.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";

interface FileDisputeFormProps {
    transactions: {
        id: string;
        productName: string;
        quantity: number;
        totalAmount: number;
        createdAt: string;
    }[];
}

export function FileDisputeForm({ transactions }: FileDisputeFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [transactionId, setTransactionId] = useState("");
    const [reason, setReason] = useState("");
    const [evidence, setEvidence] = useState("");
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    function handleSubmit() {
        if (!transactionId || !reason.trim()) return;

        startTransition(async () => {
            try {
                setMessage(null);
                const result = await fileDispute({
                    transactionId,
                    reason: reason.trim(),
                    evidence: evidence.trim() || undefined,
                });
                setMessage({
                    text: `Dispute filed successfully. Reference: ${result.referenceNumber}`,
                    type: "success",
                });
                setTransactionId("");
                setReason("");
                setEvidence("");
                router.refresh();
            } catch (err) {
                setMessage({
                    text:
                        err instanceof Error
                            ? err.message
                            : "Failed to file dispute",
                    type: "error",
                });
            }
        });
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    File a Dispute
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div
                        className={`text-sm rounded-md px-3 py-2 ${message.type === "success"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Transaction</Label>
                    <Select
                        value={transactionId}
                        onValueChange={setTransactionId}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select a transaction to dispute" />
                        </SelectTrigger>
                        <SelectContent>
                            {transactions.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.productName} — {t.quantity} units — {t.totalAmount.toLocaleString()} RWF ({new Date(t.createdAt).toLocaleDateString()})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Dispute</Label>
                    <Textarea
                        id="reason"
                        placeholder="Describe why you're disputing this transaction..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="evidence">
                        Evidence / Supporting Details{" "}
                        <span className="text-muted-foreground font-normal">
                            (optional)
                        </span>
                    </Label>
                    <Textarea
                        id="evidence"
                        placeholder="Describe any evidence: receipt numbers, delivery notes, photos taken, etc."
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        rows={2}
                    />
                </div>

                <Button
                    onClick={handleSubmit}
                    disabled={
                        isPending || !transactionId || !reason.trim()
                    }
                    variant="destructive"
                    className="w-full sm:w-auto gap-2"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <CheckCircle className="h-4 w-4" />
                    )}
                    File Dispute
                </Button>
            </CardContent>
        </Card>
    );
}
