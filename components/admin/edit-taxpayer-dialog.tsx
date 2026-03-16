"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editTaxpayer } from "@/lib/actions/admin-edit-taxpayer.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState(currentName);
    const [businessName, setBusinessName] = useState(
        currentBusinessName ?? "",
    );
    const [phone, setPhone] = useState(currentPhone ?? "");
    const [email, setEmail] = useState(currentEmail);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            try {
                await editTaxpayer(traderId, {
                    name: name !== currentName ? name : undefined,
                    businessName:
                        businessName !== (currentBusinessName ?? "")
                            ? businessName
                            : undefined,
                    phoneNumber:
                        phone !== (currentPhone ?? "") ? phone : undefined,
                    email: email !== currentEmail ? email : undefined,
                });
                setOpen(false);
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to update taxpayer.",
                );
            }
        });
    }

    // Reset form when dialog opens
    function handleOpenChange(isOpen: boolean) {
        setOpen(isOpen);
        if (isOpen) {
            setName(currentName);
            setBusinessName(currentBusinessName ?? "");
            setPhone(currentPhone ?? "");
            setEmail(currentEmail);
            setError(null);
        }
    }

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
                        Update business details. Changes will be logged in the
                        audit trail.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-name">Owner Name</Label>
                        <Input
                            id="edit-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full name"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-business">Business Name</Label>
                        <Input
                            id="edit-business"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="Business name"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-phone">Phone Number</Label>
                        <Input
                            id="edit-phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+250..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-email">Email</Label>
                        <Input
                            id="edit-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@example.com"
                            required
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
                            {error}
                        </p>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
