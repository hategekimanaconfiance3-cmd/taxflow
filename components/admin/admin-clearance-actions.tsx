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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    CheckCircle,
    AlertTriangle,
    ShieldBan,
    MoreHorizontal,
    Loader2,
} from "lucide-react";

type ClearanceStatus = "approved" | "under_review" | "suspended";

const STATUS_OPTIONS: {
    value: ClearanceStatus;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
}[] = [
        {
            value: "approved",
            label: "Approve",
            description: "Allow this business to transact normally.",
            icon: CheckCircle,
            className: "text-emerald-600",
        },
        {
            value: "under_review",
            label: "Mark Under Review",
            description: "Temporarily pause transactions for investigation.",
            icon: AlertTriangle,
            className: "text-amber-600",
        },
        {
            value: "suspended",
            label: "Suspend",
            description: "Block business from all transactions.",
            icon: ShieldBan,
            className: "text-red-600",
        },
    ];

interface AdminClearanceActionsProps {
    traderId: string;
    traderName: string;
    currentStatus: string;
}

export function AdminClearanceActions({
    traderId,
    traderName,
    currentStatus,
}: AdminClearanceActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [confirmAction, setConfirmAction] = useState<
        (typeof STATUS_OPTIONS)[number] | null
    >(null);

    function handleConfirm() {
        if (!confirmAction) return;
        startTransition(async () => {
            try {
                await updateClearanceStatus(traderId, confirmAction.value);
                router.refresh();
            } catch (error) {
                console.error("Failed to update clearance status:", error);
            } finally {
                setConfirmAction(null);
            }
        });
    }

    // Filter out the current status so we only show available actions
    const availableActions = STATUS_OPTIONS.filter(
        (opt) => opt.value !== currentStatus,
    );

    return (
        <>
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
                        <span className="sr-only">Actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    {availableActions.map((option, i) => {
                        const Icon = option.icon;
                        return (
                            <div key={option.value}>
                                {i > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                    onClick={() => setConfirmAction(option)}
                                    className="gap-2 cursor-pointer"
                                >
                                    <Icon
                                        className={`h-4 w-4 ${option.className}`}
                                    />
                                    <div>
                                        <p className="text-sm font-medium">
                                            {option.label}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                            {option.description}
                                        </p>
                                    </div>
                                </DropdownMenuItem>
                            </div>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Confirmation dialog */}
            <Dialog
                open={!!confirmAction}
                onOpenChange={(open) => !open && setConfirmAction(null)}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {confirmAction?.label} — {traderName}
                        </DialogTitle>
                        <DialogDescription>
                            {confirmAction?.description} This action will be
                            logged in the audit trail.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setConfirmAction(null)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={isPending}
                            className={
                                confirmAction?.value === "suspended"
                                    ? "bg-red-600 hover:bg-red-700"
                                    : confirmAction?.value === "under_review"
                                        ? "bg-amber-600 hover:bg-amber-700"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                            }
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
