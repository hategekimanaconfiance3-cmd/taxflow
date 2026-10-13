"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute } from "@/lib/actions/dispute.action";
import type { RRADisputeAction } from "@/lib/actions/dispute.action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Gavel, AlertTriangle } from "lucide-react";

interface AdminDisputeActionsProps {
    disputeId: string;
    referenceNumber: string;
    filerName: string;
    counterpartyName: string;
    reason: string;
    counterpartyResponse: string;
    counterpartyNote: string | null;
}

const ACTION_OPTIONS: {
    value: RRADisputeAction;
    label: string;
    description: string;
}[] = [
        {
            value: "undo_transaction",
            label: "Undo Transaction",
            description: "Reverse inventory and VAT. This is blocked if the buyer has already used the purchased stock.",
        },
        {
            value: "adjust_amount",
            label: "Adjust Amount",
            description: "Set a corrected unit price; the transaction total and VAT are recalculated.",
        },
        {
            value: "uphold_dispute",
            label: "Uphold Dispute",
            description: "Rule in favor of the filer and reverse the disputed VAT while leaving inventory unchanged.",
        },
        {
            value: "dismiss",
            label: "Dismiss",
            description: "Dismiss the dispute and restore the VAT records to the taxpayer's active balance.",
        },
    ];

export function AdminDisputeActions({
    disputeId,
    referenceNumber,
    filerName,
    counterpartyName,
    reason,
    counterpartyResponse,
    counterpartyNote,
}: AdminDisputeActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [action, setAction] = useState<RRADisputeAction | "">("");
    const [resolution, setResolution] = useState("");
    const [officialNote, setOfficialNote] = useState("");
    const [adjustedUnitPrice, setAdjustedUnitPrice] = useState("");
    const [error, setError] = useState("");

    function handleResolve() {
        if (!action || !resolution.trim() || !officialNote.trim()) return;
        if (action === "adjust_amount" && (!Number.isSafeInteger(Number(adjustedUnitPrice)) || Number(adjustedUnitPrice) <= 0)) return;

        startTransition(async () => {
            try {
                setError("");
                await resolveDispute(disputeId, {
                    action: action as RRADisputeAction,
                    resolution: resolution.trim(),
                    officialNote: officialNote.trim(),
                    ...(action === "adjust_amount" ? { adjustedUnitPrice: Number(adjustedUnitPrice) } : {}),
                });
                setOpen(false);
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to resolve dispute",
                );
            }
        });
    }

    const selectedAction = ACTION_OPTIONS.find((a) => a.value === action);

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                    setAction("");
                    setResolution("");
                    setOfficialNote("");
                    setAdjustedUnitPrice("");
                    setError("");
                    setOpen(true);
                }}
            >
                <Gavel className="h-3.5 w-3.5" />
                Take Action
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gavel className="h-5 w-5" />
                            RRA Dispute Resolution
                        </DialogTitle>
                        <DialogDescription>
                            Dispute{" "}
                            <strong className="font-mono">
                                {referenceNumber}
                            </strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Case summary */}
                        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Filed by
                                    </p>
                                    <p className="font-medium">{filerName}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Counterparty
                                    </p>
                                    <p className="font-medium">
                                        {counterpartyName}
                                    </p>
                                </div>
                            </div>
                            <Separator />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Reason
                                </p>
                                <p className="text-sm">{reason}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-muted-foreground font-medium">
                                    Counterparty response:
                                </p>
                                <Badge
                                    variant="secondary"
                                    className={`text-xs ${counterpartyResponse === "acknowledged"
                                            ? "bg-emerald-500/10 text-emerald-600"
                                            : "bg-red-500/10 text-red-600"
                                        }`}
                                >
                                    {counterpartyResponse}
                                </Badge>
                            </div>
                            {counterpartyNote && (
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Counterparty note
                                    </p>
                                    <p className="text-sm italic text-muted-foreground">
                                        &ldquo;{counterpartyNote}&rdquo;
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Action selection */}
                        <div className="space-y-2">
                            <Label>Decision</Label>
                            <Select
                                value={action}
                                onValueChange={(v) =>
                                    setAction(v as RRADisputeAction)
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select action..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACTION_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                        >
                                            <div>
                                                <span className="font-medium">
                                                    {opt.label}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedAction && (
                                <p className="text-xs text-muted-foreground">
                                    {selectedAction.description}
                                </p>
                            )}
                        </div>

                        {action === "adjust_amount" && (
                            <div className="space-y-2">
                                <Label htmlFor="adjusted-unit-price">Adjusted unit price (RWF)</Label>
                                <Input
                                    id="adjusted-unit-price"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={adjustedUnitPrice}
                                    onChange={(event) => setAdjustedUnitPrice(event.target.value)}
                                />
                            </div>
                        )}

                        {/* Internal resolution notes */}
                        <div className="space-y-2">
                            <Label>Internal Resolution Notes</Label>
                            <Textarea
                                placeholder="Document the findings and rationale for this decision (internal RRA record)..."
                                value={resolution}
                                onChange={(e) => setResolution(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* Official communication to both parties */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1">
                                Official Communication
                                <span className="text-red-500">*</span>
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                This message will be sent to <strong>both parties</strong> as official RRA communication.
                            </p>
                            <Textarea
                                placeholder={`Dear ${filerName} and ${counterpartyName},\n\nAfter reviewing dispute ${referenceNumber}, the Rwanda Revenue Authority has determined that...\n\nPlease contact RRA if you have further questions.`}
                                value={officialNote}
                                onChange={(e) => setOfficialNote(e.target.value)}
                                rows={5}
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                                {error}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleResolve}
                            disabled={
                                isPending ||
                                !action ||
                                (action === "adjust_amount" && (!Number.isSafeInteger(Number(adjustedUnitPrice)) || Number(adjustedUnitPrice) <= 0)) ||
                                !resolution.trim() ||
                                !officialNote.trim()
                            }
                            className="gap-2"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Gavel className="h-4 w-4" />
                            )}
                            Issue Decision
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
