import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TransactionStatus = "pending" | "confirmed" | "rejected" | "completed" | "expired";

const STATUS_CONFIG: Record<
    TransactionStatus,
    { label: string; className: string }
> = {
    pending: {
        label: "Pending",
        className: "bg-amber-500/10 text-amber-600 border-amber-200",
    },
    confirmed: {
        label: "Confirmed",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    },
    rejected: {
        label: "Rejected",
        className: "bg-red-500/10 text-red-600 border-red-200",
    },
    completed: {
        label: "Completed",
        className: "bg-blue-500/10 text-blue-600 border-blue-200",
    },
    expired: {
        label: "Expired",
        className: "bg-gray-500/10 text-gray-500 border-gray-200",
    },
};

export function TransactionStatusBadge({
    status,
    className,
}: {
    status: string;
    className?: string;
}) {
    const config = STATUS_CONFIG[status as TransactionStatus] ?? {
        label: status,
        className: "bg-gray-500/10 text-gray-600 border-gray-200",
    };

    return (
        <Badge
            variant="outline"
            className={cn("text-xs font-medium", config.className, className)}
        >
            {config.label}
        </Badge>
    );
}

type ClearanceStatus = "approved" | "under_review" | "suspended";

const CLEARANCE_CONFIG: Record<
    ClearanceStatus,
    { label: string; className: string }
> = {
    approved: {
        label: "Approved",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    },
    under_review: {
        label: "Under Review",
        className: "bg-amber-500/10 text-amber-600 border-amber-200",
    },
    suspended: {
        label: "Suspended",
        className: "bg-red-500/10 text-red-600 border-red-200",
    },
};

export function ClearanceStatusBadge({
    status,
    className,
}: {
    status: string;
    className?: string;
}) {
    const config = CLEARANCE_CONFIG[status as ClearanceStatus] ?? {
        label: status,
        className: "bg-gray-500/10 text-gray-600 border-gray-200",
    };

    return (
        <Badge
            variant="outline"
            className={cn("text-xs font-medium", config.className, className)}
        >
            {config.label}
        </Badge>
    );
}
