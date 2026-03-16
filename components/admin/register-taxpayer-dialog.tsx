"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";
import { registerTaxpayer } from "@/lib/actions/admin-register.action";

export function RegisterTaxpayerDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [form, setForm] = useState({
        name: "",
        email: "",
        tinNumber: "",
        businessName: "",
        phoneNumber: "",
        role: "manufacturer" as "manufacturer" | "wholesaler" | "retailer",
    });

    function updateField(field: string, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError(null);
    }

    function handleSubmit() {
        setError(null);
        startTransition(async () => {
            try {
                await registerTaxpayer(form);
                setSuccess(true);
                router.refresh();
            } catch (e) {
                setError(
                    e instanceof Error ? e.message : "Registration failed",
                );
            }
        });
    }

    function handleClose() {
        setOpen(false);
        setForm({
            name: "",
            email: "",
            tinNumber: "",
            businessName: "",
            phoneNumber: "",
            role: "manufacturer",
        });
        setError(null);
        setSuccess(false);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
        >
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <UserPlus className="h-3.5 w-3.5" />
                    Register New Taxpayer
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Register New Taxpayer</DialogTitle>
                </DialogHeader>

                {success ? (
                    <div className="py-6 text-center">
                        <p className="text-lg font-semibold text-emerald-600">
                            ✓ Taxpayer registered successfully
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {form.businessName || form.name} ({form.tinNumber})
                        </p>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={handleClose}
                        >
                            Done
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Full Name *</Label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) =>
                                            updateField("name", e.target.value)
                                        }
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>TIN Number *</Label>
                                    <Input
                                        value={form.tinNumber}
                                        onChange={(e) =>
                                            updateField(
                                                "tinNumber",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="100234567"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Business Name</Label>
                                <Input
                                    value={form.businessName}
                                    onChange={(e) =>
                                        updateField(
                                            "businessName",
                                            e.target.value,
                                        )
                                    }
                                    placeholder="Company Ltd"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Email *</Label>
                                    <Input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) =>
                                            updateField(
                                                "email",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="name@company.rw"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={form.phoneNumber}
                                        onChange={(e) =>
                                            updateField(
                                                "phoneNumber",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="+250 7..."
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Role *</Label>
                                <Select
                                    value={form.role}
                                    onValueChange={(v) =>
                                        updateField("role", v)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manufacturer">
                                            Manufacturer
                                        </SelectItem>
                                        <SelectItem value="wholesaler">
                                            Wholesaler
                                        </SelectItem>
                                        <SelectItem value="retailer">
                                            Retailer
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {error && (
                                <p className="text-sm text-destructive">
                                    {error}
                                </p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={
                                    isPending ||
                                    !form.name.trim() ||
                                    !form.email.trim() ||
                                    !form.tinNumber.trim()
                                }
                                className="gap-2"
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <UserPlus className="h-3.5 w-3.5" />
                                )}
                                Register
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
