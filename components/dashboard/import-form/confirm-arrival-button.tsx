"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { submitImportArrival } from "@/lib/actions/import.action";
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
import { Loader2, Upload, AlertTriangle, FileUp, FileCheck, X } from "lucide-react";

interface SubmitArrivalButtonProps {
    declarationId: string;
    productName: string;
    expectedQuantity: number;
}

export function SubmitArrivalButton({
    declarationId,
    productName,
    expectedQuantity,
}: SubmitArrivalButtonProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [actualQuantity, setActualQuantity] = useState("");
    const [invoiceRef, setInvoiceRef] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadedUrl, setUploadedUrl] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const qty = parseInt(actualQuantity) || 0;
    const discrepancy = qty > 0 ? Math.abs(expectedQuantity - qty) / expectedQuantity : 0;
    const hasDiscrepancy = discrepancy > 0.1;

    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate client-side
        if (file.type !== "application/pdf") {
            setError("Only PDF files are allowed");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError("File must be under 10 MB");
            return;
        }

        setError("");
        setSelectedFile(file);

        // Upload immediately
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/upload/import-invoice", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Upload failed");
            }

            setUploadedUrl(data.url);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to upload file",
            );
            setSelectedFile(null);
        } finally {
            setIsUploading(false);
        }
    }

    function clearFile() {
        setSelectedFile(null);
        setUploadedUrl("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function handleSubmit() {
        if (qty <= 0 || !invoiceRef.trim() || !uploadedUrl) return;

        startTransition(async () => {
            try {
                setError("");
                await submitImportArrival(declarationId, {
                    actualQuantity: qty,
                    invoiceRef: invoiceRef.trim(),
                    supportingDoc: uploadedUrl,
                });
                setOpen(false);
                setActualQuantity("");
                setInvoiceRef("");
                setSelectedFile(null);
                setUploadedUrl("");
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Submission failed",
                );
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                    <Upload className="h-3.5 w-3.5" />
                    Submit Arrival
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Submit Arrival for Confirmation</DialogTitle>
                    <DialogDescription>
                        Enter the actual quantity received and upload the
                        scanned invoice (PDF). An RRA official will review and
                        confirm.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="text-sm text-muted-foreground">
                        <strong>{productName}</strong> — Expected:{" "}
                        <span className="font-mono">
                            {expectedQuantity.toLocaleString()}
                        </span>{" "}
                        units
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="actualQty">
                            Actual Quantity Received
                        </Label>
                        <Input
                            id="actualQty"
                            type="number"
                            min={1}
                            value={actualQuantity}
                            onChange={(e) => setActualQuantity(e.target.value)}
                            placeholder="Enter actual quantity"
                        />
                        {hasDiscrepancy && qty > 0 && (
                            <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Quantity differs from expected by{" "}
                                {Math.round(discrepancy * 100)}% — RRA will
                                review this.
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="invoiceRef">
                            Invoice / Import Document Reference
                        </Label>
                        <Input
                            id="invoiceRef"
                            value={invoiceRef}
                            onChange={(e) => setInvoiceRef(e.target.value)}
                            placeholder="e.g. INV-2025-001234"
                        />
                    </div>

                    {/* PDF Upload */}
                    <div className="space-y-2">
                        <Label>
                            Invoice PDF{" "}
                            <span className="text-red-500">*</span>
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Upload the scanned invoice or import document (PDF,
                            max 10 MB). Must be clearly visible and legible.
                        </p>

                        {!selectedFile ? (
                            <div
                                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm font-medium">
                                    Click to upload PDF
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    PDF files only, up to 10 MB
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </div>
                        ) : (
                            <div className="border rounded-lg p-3 flex items-center gap-3">
                                {isUploading ? (
                                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
                                ) : uploadedUrl ? (
                                    <FileCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                                ) : (
                                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {selectedFile.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {(
                                            selectedFile.size /
                                            (1024 * 1024)
                                        ).toFixed(1)}{" "}
                                        MB
                                        {isUploading
                                            ? " — Uploading…"
                                            : uploadedUrl
                                                ? " — Uploaded ✓"
                                                : " — Upload failed"}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={clearFile}
                                    disabled={isUploading}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
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
                        disabled={
                            isPending ||
                            isUploading ||
                            qty <= 0 ||
                            !invoiceRef.trim() ||
                            !uploadedUrl
                        }
                        className="gap-2"
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Upload className="h-4 w-4" />
                        )}
                        Submit for RRA Review
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
