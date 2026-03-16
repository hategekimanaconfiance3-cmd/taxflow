"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    flagTransaction,
    cancelTransaction,
} from "@/lib/actions/admin.action";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    MoreHorizontal,
    Flag,
    Ban,
    Loader2,
} from "lucide-react";

type ActionType = "flag" | "cancel";

interface AdminTransactionActionsProps {
    transactionId: string;
    currentStatus: string;
}

export function AdminTransactionActions({
    transactionId,
    currentStatus,
}: AdminTransactionActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [action, setAction] = useState<ActionType | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    const isRejected = currentStatus === "rejected";

    function handleConfirm() {
        if (!action || !reason.trim()) return;
        setError(null);

        startTransition(async () => {
            try {
                if (action === "flag") {
                    await flagTransaction(transactionId, reason);
                } else {
                    await cancelTransaction(transactionId, reason);
                }
                setAction(null);
                setReason("");
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Action failed.",
                );
            }
        });
    }

    if (isRejected) return null;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">Actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                        onClick={() => {
                            setAction("flag");
                            setError(null);
                            setReason("");
                        }}
                        className="gap-2 cursor-pointer"
                    >
                        <Flag className="h-4 w-4 text-amber-600" />
                        <span>Flag as Suspicious</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => {
                            setAction("cancel");
                            setError(null);
                            setReason("");
                        }}
                        className="gap-2 cursor-pointer text-red-600"
                    >
                        <Ban className="h-4 w-4" />
                        <span>Cancel Transaction</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Reason dialog */}
            <Dialog
                open={!!action}
                onOpenChange={(open) => {
                    if (!open) {
                        setAction(null);
                        setReason("");
                        setError(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {action === "flag"
                                ? "Flag Transaction"
                                : "Cancel Transaction"}
                        </DialogTitle>
                        <DialogDescription>
                            {action === "flag"
                                ? "Mark this transaction as suspicious. It will be logged in the audit trail for investigation."
                                : "This will permanently reject this transaction. This action cannot be undone."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Label htmlFor="txn-reason">
                            Reason <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="txn-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Provide a detailed reason..."
                            rows={3}
                        />
                        {error && (
                            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
                                {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setAction(null)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={isPending || !reason.trim()}
                            className={
                                action === "cancel"
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-amber-600 hover:bg-amber-700"
                            }
                        >
                            {isPending && (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            {action === "flag" ? "Flag" : "Cancel Transaction"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
