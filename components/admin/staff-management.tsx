"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    updateStaffClearance,
    toggleStaffStatus,
} from "@/lib/actions/admin-staff.action";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Shield, Power } from "lucide-react";

// ---------------------------------------------------------------------------
// Clearance Level Selector
// ---------------------------------------------------------------------------

const LEVELS = [
    { value: "super_admin", label: "Super Admin" },
    { value: "compliance_officer", label: "Compliance Officer" },
    { value: "audit_officer", label: "Audit Officer" },
    { value: "stock_officer", label: "Stock Monitoring Officer" },
    { value: "correction_officer", label: "Correction Officer" },
    { value: "reporting_officer", label: "Reporting & Analytics" },
];

export function StaffClearanceSelect({
    staffId,
    currentLevel,
}: {
    staffId: string;
    currentLevel: string;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleChange(value: string) {
        if (value === currentLevel) return;
        startTransition(async () => {
            await updateStaffClearance(staffId, value);
            router.refresh();
        });
    }

    return (
        <div className="flex items-center gap-1.5">
            <Select
                defaultValue={currentLevel}
                onValueChange={handleChange}
                disabled={isPending}
            >
                <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                            {l.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Toggle Active / Inactive
// ---------------------------------------------------------------------------

export function StaffToggleButton({
    staffId,
    isActive,
}: {
    staffId: string;
    isActive: boolean;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleToggle() {
        startTransition(async () => {
            await toggleStaffStatus(staffId);
            router.refresh();
        });
    }

    return (
        <Button
            variant={isActive ? "outline" : "default"}
            size="sm"
            className={`gap-1.5 h-7 text-xs ${isActive
                ? "text-red-600 hover:bg-red-50"
                : "bg-emerald-600 hover:bg-emerald-700"
                }`}
            onClick={handleToggle}
            disabled={isPending}
        >
            {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
                <Power className="h-3 w-3" />
            )}
            {isActive ? "Deactivate" : "Activate"}
        </Button>
    );
}
