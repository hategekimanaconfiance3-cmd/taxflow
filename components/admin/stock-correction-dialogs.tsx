"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import {
    editStockRecord,
    deleteStockRecord,
} from "@/lib/actions/admin-stock-correction.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StockRow {
    id: string;
    quantity: number;
    price: number | null;
    source: string | null;
    productName: string;
    productUnit: string;
}

const SOURCE_OPTIONS = [
    { value: "manufactured", label: "Manufactured" },
    { value: "imported", label: "Imported" },
    { value: "purchased", label: "Purchased" },
    { value: "transferred", label: "Transferred" },
    { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Edit Stock Dialog
// ---------------------------------------------------------------------------

export function EditStockDialog({ row }: { row: StockRow }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [quantity, setQuantity] = useState(String(row.quantity));
    const [price, setPrice] = useState(row.price ? String(row.price) : "");
    const [source, setSource] = useState(row.source ?? "");
    const [reason, setReason] = useState("");

    const handleSubmit = () => {
        setError(null);

        const updates: { quantity?: number; price?: number | null; source?: string | null } = {};

        const newQty = parseInt(quantity, 10);
        if (!isNaN(newQty) && newQty !== row.quantity) updates.quantity = newQty;

        const newPrice = price ? parseInt(price, 10) : null;
        if (newPrice !== row.price) updates.price = newPrice;

        if (source !== (row.source ?? "")) updates.source = source || null;

        if (Object.keys(updates).length === 0) {
            setError("No changes detected.");
            return;
        }

        startTransition(async () => {
            try {
                await editStockRecord(row.id, updates, reason);
                setOpen(false);
                router.refresh();
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to update.");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Stock Record</DialogTitle>
                    <DialogDescription>
                        {row.productName} — correct quantity, price, or source.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-qty">
                                Quantity ({row.productUnit})
                            </Label>
                            <Input
                                id="edit-qty"
                                type="number"
                                min={0}
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-price">Price (RWF)</Label>
                            <Input
                                id="edit-price"
                                type="number"
                                min={0}
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit-source">Source</Label>
                        <Select value={source} onValueChange={setSource}>
                            <SelectTrigger id="edit-source">
                                <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent>
                                {SOURCE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit-reason">
                            Reason for Correction <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="edit-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Explain why this correction is needed (min 5 characters)"
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || reason.trim().length < 5}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            "Save Correction"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Delete Stock Dialog
// ---------------------------------------------------------------------------

export function DeleteStockDialog({ row }: { row: StockRow }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [reason, setReason] = useState("");

    const handleDelete = () => {
        setError(null);

        startTransition(async () => {
            try {
                await deleteStockRecord(row.id, reason);
                setOpen(false);
                router.refresh();
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to delete.");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Delete"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-red-600">
                        Delete Stock Record
                    </DialogTitle>
                    <DialogDescription>
                        This will permanently remove the stock entry for{" "}
                        <strong>{row.productName}</strong> ({row.quantity}{" "}
                        {row.productUnit}). This action is logged and cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="delete-reason">
                            Reason for Deletion <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="delete-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Explain why this record should be deleted (min 5 characters)"
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending || reason.trim().length < 5}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            "Delete Record"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
