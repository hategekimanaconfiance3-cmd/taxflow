"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClearanceStatus } from "@/lib/actions/admin.action";
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
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    CheckCircle,
    AlertTriangle,
    ShieldBan,
    ShieldCheck,
    MoreHorizontal,
    Loader2,
    AlertCircle,
} from "lucide-react";

type ClearanceStatus = "approved" | "under_review" | "suspended";

interface StatusOption {
    value: ClearanceStatus;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    iconClass: string;
    confirmClass: string;
    // Show only when transitioning FROM these statuses (empty = always)
    onlyFrom?: ClearanceStatus[];
}

const STATUS_OPTIONS: StatusOption[] = [
    {
        value: "approved",
        label: "Approve Account",
        description: "Allow this business to transact normally.",
        icon: CheckCircle,
        iconClass: "text-emerald-600",
        confirmClass: "bg-emerald-600 hover:bg-emerald-700",
    },
    {
        value: "approved",
        label: "Reinstate Account",
        description: "Lift the suspension and restore normal trading access.",
        icon: ShieldCheck,
        iconClass: "text-emerald-600",
        confirmClass: "bg-emerald-600 hover:bg-emerald-700",
        onlyFrom: ["suspended"],
    },
    {
        value: "under_review",
        label: "Place Under Review",
        description: "Temporarily pause transactions pending investigation.",
        icon: AlertTriangle,
        iconClass: "text-amber-600",
        confirmClass: "bg-amber-600 hover:bg-amber-700",
    },
    {
        value: "suspended",
        label: "Suspend Account",
        description: "Block this business from all transactions immediately.",
        icon: ShieldBan,
        iconClass: "text-red-600",
        confirmClass: "bg-red-600 hover:bg-red-700",
    },
];

interface AdminClearanceActionsProps {
    traderId: string;
    traderName: string;
    currentStatus: string;
    /** If true, renders as a full button set rather than a dropdown trigger */
    variant?: "dropdown" | "buttons";
}

export function AdminClearanceActions({
    traderId,
    traderName,
    currentStatus,
    variant = "dropdown",
}: AdminClearanceActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [confirmAction, setConfirmAction] = useState<StatusOption | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    // Compute which actions are available from the current status
    const availableActions = STATUS_OPTIONS.filter((opt) => {
        if (opt.value === currentStatus) return false;
        if (opt.onlyFrom && !opt.onlyFrom.includes(currentStatus as ClearanceStatus)) return false;
        // De-duplicate: skip generic "Approve" when "Reinstate" applies
        if (opt.label === "Approve Account" && currentStatus === "suspended") return false;
        return true;
    });

    function openConfirm(option: StatusOption) {
        setConfirmAction(option);
        setReason("");
        setError("");
    }

    function handleConfirm() {
        if (!confirmAction) return;
        const trimmed = reason.trim();
        if (trimmed.length < 10) {
            setError("Please provide a reason of at least 10 characters.");
            return;
        }
        setError("");
        startTransition(async () => {
            try {
                await updateClearanceStatus(traderId, confirmAction.value, trimmed);
                setConfirmAction(null);
                setReason("");
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to update account status.",
                );
            }
        });
    }

    function handleClose() {
        if (isPending) return;
        setConfirmAction(null);
        setReason("");
        setError("");
    }

    const trigger =
        variant === "buttons" ? (
            <div className="flex flex-wrap gap-2">
                {availableActions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                        <Button
                            key={opt.label}
                            variant="outline"
                            size="sm"
                            className={`h-8 gap-1.5 text-xs font-medium ${opt.iconClass}`}
                            onClick={() => openConfirm(opt)}
                            disabled={isPending}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                        </Button>
                    );
                })}
            </div>
        ) : (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <MoreHorizontal className="h-4 w-4" />
                        )}
                        <span className="sr-only">Account actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {availableActions.map((option, i) => {
                        const Icon = option.icon;
                        return (
                            <div key={option.label}>
                                {i > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                    onClick={() => openConfirm(option)}
                                    className="gap-2 cursor-pointer"
                                >
                                    <Icon className={`h-4 w-4 ${option.iconClass}`} />
                                    <div>
                                        <p className="text-sm font-medium">{option.label}</p>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                            {option.description}
                                        </p>
                                    </div>
                                </DropdownMenuItem>
                            </div>
                        );
                    })}
                    {availableActions.length === 0 && (
                        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                            No actions available
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        );

    return (
        <>
            {trigger}

            {/* Confirmation dialog with mandatory reason */}
            <Dialog open={!!confirmAction} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {confirmAction && (() => {
                                const Icon = confirmAction.icon;
                                return <Icon className={`h-5 w-5 ${confirmAction.iconClass}`} />;
                            })()}
                            {confirmAction?.label}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Context */}
                        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <p className="font-medium">{traderName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Current status:{" "}
                                <span className="capitalize font-medium">
                                    {currentStatus.replace(/_/g, " ")}
                                </span>
                                {" → "}
                                <span className={`capitalize font-semibold ${confirmAction?.iconClass}`}>
                                    {confirmAction?.value.replace(/_/g, " ")}
                                </span>
                            </p>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {confirmAction?.description} This action is permanent until reversed and{" "}
                            <strong>will be recorded in the immutable audit trail.</strong>
                        </p>

                        {/* Mandatory reason */}
                        <div>
                            <Label htmlFor="clearance-reason" className="text-xs mb-1.5 block">
                                Reason for change{" "}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                id="clearance-reason"
                                rows={3}
                                value={reason}
                                onChange={(e) => {
                                    setReason(e.target.value);
                                    if (error) setError("");
                                }}
                                placeholder="Explain why this status change is being made (min 10 characters)…"
                                className="text-sm resize-none"
                                disabled={isPending}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Required. Stored in the audit log alongside this action.
                            </p>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={isPending || reason.trim().length < 10}
                            className={confirmAction?.confirmClass}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Applying…
                                </>
                            ) : (
                                confirmAction?.label
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
