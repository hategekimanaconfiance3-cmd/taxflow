"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Loader2, Power, Shield, Settings2 } from "lucide-react";
import { updateStaffRoles, toggleStaffStatus } from "@/lib/actions/admin-staff.action";
import { removeStaffPriceJurisdiction, setStaffPriceJurisdiction } from "@/lib/actions/price-jurisdiction.action";
import { ASSIGNABLE_STAFF_ROLE_OPTIONS, STAFF_ROLE_OPTIONS } from "@/lib/validation/staff.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StaffAccountDialog } from "@/components/admin/staff-account-dialog";
import { StaffPasswordResetDialog } from "@/components/admin/staff-password-reset-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type StaffManagementMember = {
    id: string;
    staffId: string;
    name: string;
    email: string;
    department: string | null;
    clearanceLevel: string;
    roles: string[];
    isActive: boolean;
    jurisdictions: { id: string; scopeType: string; province: string | null; district: string | null }[];
};

type Notice = { message: string; kind: "success" | "error" };

const assignableRoleValues: ReadonlySet<string> = new Set(ASSIGNABLE_STAFF_ROLE_OPTIONS.map((role) => role.value));
const getAssignableRoles = (roles: string[]) => roles.filter((role) => assignableRoleValues.has(role));

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
                    <p className="mt-3 font-medium">No TF staff accounts yet</p>
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
                    <div className="mt-2 flex flex-wrap gap-1">{member.roles.map((role) => <Badge key={role} variant="outline">{STAFF_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role}</Badge>)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                        {member.jurisdictions.map((scope) => <Badge key={scope.id} variant="secondary">{scope.scopeType}{scope.district ? ` · ${scope.district}` : scope.province ? ` · ${scope.province}` : ""}</Badge>)}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <div className="flex items-center gap-2">
                    <StaffRolesDialog member={member} disabled={isPending} onNotice={onNotice} onChanged={onChanged} />
                    <StaffJurisdictionDialog member={member} disabled={isPending} onNotice={onNotice} onChanged={onChanged} />
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

function StaffJurisdictionDialog({ member, disabled, onNotice, onChanged }: { member: StaffManagementMember; disabled: boolean; onNotice: (message: string, kind: Notice["kind"]) => void; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [scopeType, setScopeType] = useState("district");
    const [province, setProvince] = useState("");
    const [district, setDistrict] = useState("");
    const [reason, setReason] = useState("");
    function assign() {
        startTransition(async () => {
            const result = await setStaffPriceJurisdiction(member.id, { scopeType, province: scopeType === "national" ? undefined : province, district: scopeType === "district" ? district : undefined, reason });
            if (!result.success) { onNotice(result.error, "error"); return; }
            setOpen(false); setReason(""); onChanged(); onNotice("Price-monitoring jurisdiction assigned.", "success");
        });
    }
    function remove(id: string) {
        const removalReason = window.prompt("Reason for removing this jurisdiction:", "Assignment updated") ?? "";
        if (removalReason.trim().length < 5) return;
        startTransition(async () => {
            const result = await removeStaffPriceJurisdiction(id, removalReason);
            if (!result.success) { onNotice(result.error, "error"); return; }
            onChanged(); onNotice("Price-monitoring jurisdiction removed.", "success");
        });
    }
    return <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled}>Jurisdiction</Button></DialogTrigger>
        <DialogContent>
            <DialogHeader><DialogTitle>Price-monitoring jurisdiction</DialogTitle></DialogHeader>
            <div className="space-y-3">
                <div className="space-y-1"><label className="text-sm font-medium">Current assignments</label><div className="flex flex-wrap gap-2">{member.jurisdictions.length ? member.jurisdictions.map((scope) => <Badge key={scope.id} variant="secondary">{scope.scopeType}{scope.district ? ` · ${scope.district}` : scope.province ? ` · ${scope.province}` : ""}<button type="button" className="ml-1" onClick={() => remove(scope.id)} aria-label="Remove jurisdiction">×</button></Badge>) : <span className="text-sm text-muted-foreground">Unassigned</span>}</div></div>
                <div className="space-y-1"><label className="text-sm font-medium">Add scope</label><select value={scopeType} onChange={(event) => setScopeType(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="national">National</option><option value="province">Province</option><option value="district">District</option></select></div>
                {scopeType !== "national" ? <input value={province} onChange={(event) => setProvince(event.target.value)} placeholder="Province" className="h-9 w-full rounded-md border bg-background px-3 text-sm" /> : null}
                {scopeType === "district" ? <input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="District" className="h-9 w-full rounded-md border bg-background px-3 text-sm" /> : null}
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (minimum 5 characters)" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
            <DialogFooter><Button type="button" disabled={pending || reason.trim().length < 5} onClick={assign}>{pending ? <Loader2 className="animate-spin" /> : "Assign scope"}</Button></DialogFooter>
        </DialogContent>
    </Dialog>;
}

function StaffRolesDialog({
    member,
    disabled,
    onNotice,
    onChanged,
}: {
    member: StaffManagementMember;
    disabled: boolean;
    onNotice: (message: string, kind: Notice["kind"]) => void;
    onChanged: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [roles, setRoles] = useState(() => getAssignableRoles(member.roles));
    const [isPending, startTransition] = useTransition();

    function toggleRole(value: string, checked: boolean) {
        setRoles((current) => {
            if (value === "super_admin" && checked) return [value];
            if (current.includes("super_admin")) return checked ? [value] : [];
            return checked ? [...current, value] : current.filter((role) => role !== value);
        });
    }

    function save() {
        startTransition(async () => {
            const result = await updateStaffRoles(member.id, roles);
            if (!result.success) {
                onNotice(result.error, "error");
                return;
            }
            setOpen(false);
            onChanged();
            onNotice(`Roles updated for ${member.staffId}.`, "success");
        });
    }

    return (
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setRoles(getAssignableRoles(member.roles)); }}>
            <DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled}><Settings2 className="size-4" />Manage roles</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Role assignments · {member.staffId}</DialogTitle>
                    <DialogDescription>Select the predefined permission bundles this worker needs. Super Admin must be assigned alone.</DialogDescription>
                </DialogHeader>
                {member.roles.some((role) => !assignableRoleValues.has(role)) ? (
                    <p className="text-sm text-amber-700">This staff member has a legacy role. Choose current roles below and save to replace the legacy assignment; historical role access remains supported until then.</p>
                ) : null}
                <div className="space-y-2">
                    {ASSIGNABLE_STAFF_ROLE_OPTIONS.map((role) => (
                        <label key={role.value} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50">
                            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={roles.includes(role.value)} disabled={isPending}
                                onChange={(event) => toggleRole(role.value, event.target.checked)} />
                            <span><span className="text-sm font-medium">{role.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{role.permissions}</span></span>
                        </label>
                    ))}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                    <Button type="button" onClick={save} disabled={isPending || roles.length === 0}>
                        {isPending ? <Loader2 className="animate-spin" /> : null}Save role assignments
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
