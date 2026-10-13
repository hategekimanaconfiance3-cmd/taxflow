"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Loader2, Power, Shield } from "lucide-react";
import { updateStaffClearance, toggleStaffStatus } from "@/lib/actions/admin-staff.action";
import { STAFF_ROLE_OPTIONS } from "@/lib/validation/staff.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StaffAccountDialog } from "@/components/admin/staff-account-dialog";
import { StaffPasswordResetDialog } from "@/components/admin/staff-password-reset-dialog";

export type StaffManagementMember = {
    id: string;
    staffId: string;
    name: string;
    email: string;
    department: string | null;
    clearanceLevel: string;
    isActive: boolean;
};

type Notice = { message: string; kind: "success" | "error" };

export function StaffManagement({ staffMembers }: { staffMembers: StaffManagementMember[] }) {
    const router = useRouter();
    const [notice, setNotice] = useState<Notice | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    function showNotice(message: string, kind: Notice["kind"]): void {
        if (timer.current) clearTimeout(timer.current);
        setNotice({ message, kind });
        timer.current = setTimeout(() => setNotice(null), 4500);
    }

    return (
        <div className="flex flex-col gap-4">
            {notice ? (
                <div
                    role={notice.kind === "error" ? "alert" : "status"}
                    aria-live={notice.kind === "error" ? "assertive" : "polite"}
                    className={cn(
                        "fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-lg",
                        notice.kind === "error" ? "border-destructive/40 text-destructive" : "border-primary/30 text-foreground",
                    )}
                >
                    {notice.kind === "error" ? <CircleX className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" />}
                    <span>{notice.message}</span>
                    <Button type="button" variant="ghost" size="icon-xs" className="ml-auto" aria-label="Dismiss notice" onClick={() => setNotice(null)}>×</Button>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">Manage staff accounts, access roles, and credentials.</p>
                <StaffAccountDialog onNotice={showNotice} onCreated={() => router.refresh()} />
            </div>

            {staffMembers.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center">
                    <Shield className="text-muted-foreground mx-auto size-8" />
                    <p className="mt-3 font-medium">No RRA staff accounts yet</p>
                    <p className="text-muted-foreground mt-1 text-sm">Add a staff member to grant admin dashboard access.</p>
                </div>
            ) : (
                <div className="flex flex-col divide-y rounded-md border">
                    {staffMembers.map((member) => (
                        <StaffMemberRow key={member.id} member={member} onNotice={showNotice} onChanged={() => router.refresh()} />
                    ))}
                </div>
            )}
        </div>
    );
}

function StaffMemberRow({
    member,
    onNotice,
    onChanged,
}: {
    member: StaffManagementMember;
    onNotice: (message: string, kind: Notice["kind"]) => void;
    onChanged: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const roleLabel = STAFF_ROLE_OPTIONS.find((role) => role.value === member.clearanceLevel)?.label ?? member.clearanceLevel;

    function handleRoleChange(value: string): void {
        if (value === member.clearanceLevel) return;
        startTransition(async () => {
            const result = await updateStaffClearance(member.id, value);
            if (!result.success) {
                onNotice(result.error, "error");
                return;
            }
            onChanged();
            onNotice(`Role updated for ${member.staffId}.`, "success");
        });
    }

    function handleToggle(): void {
        startTransition(async () => {
            const result = await toggleStaffStatus(member.id);
            if (!result.success) {
                onNotice(result.error, "error");
                return;
            }
            onChanged();
            onNotice(`${member.staffId} ${result.isActive ? "activated" : "deactivated"}.`, "success");
        });
    }

    return (
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
                    <Shield className="text-muted-foreground size-5" />
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{member.name}</p>
                        <Badge variant={member.isActive ? "secondary" : "outline"}>{member.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">{member.staffId} · {member.email}</p>
                    <p className="text-muted-foreground text-xs">{member.department || "No department assigned"}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <div className="flex items-center gap-2">
                    <Select value={member.clearanceLevel} onValueChange={handleRoleChange} disabled={isPending}>
                        <SelectTrigger className="w-[190px]" aria-label={`Role for ${member.staffId}`}>
                            <SelectValue>{roleLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {STAFF_ROLE_OPTIONS.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
            {isPending ? <Loader2 className="text-muted-foreground size-4 animate-spin" /> : null}
                </div>
                <Button variant={member.isActive ? "outline" : "default"} size="sm" className="gap-1.5" onClick={handleToggle} disabled={isPending}>
                    {isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Power data-icon="inline-start" />}
                    {member.isActive ? "Deactivate" : "Activate"}
                </Button>
                <StaffPasswordResetDialog staffRecordId={member.id} staffId={member.staffId} onNotice={onNotice} />
            </div>
        </div>
    );
}
