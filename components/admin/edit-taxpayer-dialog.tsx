"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editTaxpayer } from "@/lib/actions/admin-edit-taxpayer.action";
import { taxpayerEditFieldsSchema, type TaxpayerEditFields } from "@/lib/validation/admin-taxpayer.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";

interface EditTaxpayerDialogProps {
  traderId: string;
  currentName: string;
  currentBusinessName: string | null;
  currentPhone: string | null;
  currentEmail: string;
}

export function EditTaxpayerDialog({
  traderId,
  currentName,
  currentBusinessName,
  currentPhone,
  currentEmail,
}: EditTaxpayerDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<TaxpayerEditFields>({
    resolver: zodResolver(taxpayerEditFieldsSchema),
    defaultValues: {
      name: currentName,
      businessName: currentBusinessName ?? "",
      phoneNumber: currentPhone ?? "",
      email: currentEmail,
      reason: "",
    },
  });

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      form.reset({
        name: currentName,
        businessName: currentBusinessName ?? "",
        phoneNumber: currentPhone ?? "",
        email: currentEmail,
        reason: "",
      });
      setServerError(null);
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await editTaxpayer({ ...values, traderId });
        if (!result.success) {
          setServerError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Taxpayer edit request failed", error);
        setServerError("Taxpayer details could not be saved. Please try again.");
      }
    });
  });

  const fieldError = (name: keyof TaxpayerEditFields) => form.formState.errors[name]?.message;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Taxpayer Information</DialogTitle>
          <DialogDescription>
            Update taxpayer details. Give a reason for the audit trail; changes are reviewed by authorized RRA officers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Owner Name</Label>
            <Input id="edit-name" autoComplete="name" aria-invalid={Boolean(fieldError("name"))} {...form.register("name")} />
            {fieldError("name") && <p role="alert" className="text-sm text-destructive">{fieldError("name")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-business">Business Name</Label>
            <Input id="edit-business" aria-invalid={Boolean(fieldError("businessName"))} {...form.register("businessName")} />
            {fieldError("businessName") && <p role="alert" className="text-sm text-destructive">{fieldError("businessName")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone Number</Label>
            <Input id="edit-phone" type="tel" autoComplete="tel" aria-invalid={Boolean(fieldError("phoneNumber"))} {...form.register("phoneNumber")} />
            {fieldError("phoneNumber") && <p role="alert" className="text-sm text-destructive">{fieldError("phoneNumber")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" autoComplete="email" aria-invalid={Boolean(fieldError("email"))} {...form.register("email")} />
            {fieldError("email") && <p role="alert" className="text-sm text-destructive">{fieldError("email")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reason">Reason for change</Label>
            <Textarea id="edit-reason" rows={3} aria-invalid={Boolean(fieldError("reason"))} {...form.register("reason")} />
            {fieldError("reason") && <p role="alert" className="text-sm text-destructive">{fieldError("reason")}</p>}
          </div>

          {serverError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
