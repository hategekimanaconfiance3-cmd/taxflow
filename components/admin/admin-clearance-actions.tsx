"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateClearanceStatus } from "@/lib/actions/admin.action";
import { clearanceReasonSchema } from "@/lib/validation/admin-taxpayer.schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { CheckCircle, AlertTriangle, ShieldBan, MoreHorizontal, Loader2 } from "lucide-react";
import type { z } from "zod";

type ClearanceStatus = "approved" | "under_review" | "suspended";
type ClearanceReason = z.infer<typeof clearanceReasonSchema>;

const STATUS_OPTIONS: {
  value: ClearanceStatus;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}[] = [
  { value: "approved", label: "Approve", description: "Allow this business to transact normally.", icon: CheckCircle, className: "text-emerald-600" },
  { value: "under_review", label: "Mark Under Review", description: "Flag the clearance status for officer review.", icon: AlertTriangle, className: "text-amber-600" },
  { value: "suspended", label: "Suspend", description: "Suspend this business from transactions.", icon: ShieldBan, className: "text-red-600" },
];

interface AdminClearanceActionsProps {
  traderId: string;
  traderName: string;
  currentStatus: string;
}

export function AdminClearanceActions({ traderId, traderName, currentStatus }: AdminClearanceActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<(typeof STATUS_OPTIONS)[number] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ClearanceReason>({ resolver: zodResolver(clearanceReasonSchema), defaultValues: { reason: "" } });

  function chooseAction(option: (typeof STATUS_OPTIONS)[number]) {
    form.reset({ reason: "" });
    setServerError(null);
    setConfirmAction(option);
  }

  function closeDialog(open: boolean) {
    if (!open && !isPending) {
      setConfirmAction(null);
      setServerError(null);
    }
  }

  const onSubmit = form.handleSubmit(({ reason }) => {
    if (!confirmAction) return;
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await updateClearanceStatus({ traderId, status: confirmAction.value, reason });
        if (!result.success) {
          setServerError(result.error);
          return;
        }
        setConfirmAction(null);
        router.refresh();
      } catch (error) {
        console.error("Clearance update request failed", error);
        setServerError("Clearance status could not be updated. Please try again.");
      }
    });
  });

  const availableActions = STATUS_OPTIONS.filter((option) => option.value !== currentStatus);
  const reasonError = form.formState.errors.reason?.message;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={isPending} aria-label="Taxpayer clearance actions">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            Clearance actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {availableActions.map((option, index) => {
            const Icon = option.icon;
            return (
              <div key={option.value}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => chooseAction(option)} className="cursor-pointer gap-2">
                  <Icon className={`h-4 w-4 ${option.className}`} />
                  <div>
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">{option.description}</p>
                  </div>
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={Boolean(confirmAction)} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction?.label} — {traderName}</DialogTitle>
            <DialogDescription>
              {confirmAction?.description} This is an RRA officer action and will be recorded in the audit trail. Provide the reason for this decision.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="clearance-reason" className="text-sm font-medium">Reason</label>
              <Textarea id="clearance-reason" rows={4} aria-invalid={Boolean(reasonError)} {...form.register("reason")} />
              {reasonError && <p role="alert" className="text-sm text-destructive">{reasonError}</p>}
            </div>
            {serverError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending} className={confirmAction?.value === "suspended" ? "bg-red-600 hover:bg-red-700" : confirmAction?.value === "under_review" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm decision
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
