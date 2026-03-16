"use client";

import { useState, useTransition } from "react";
import { generateTaxReportPDF } from "@/lib/actions/export.action";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown } from "lucide-react";

/**
 * Client-side button that triggers PDF generation and downloads the result.
 */
export function ExportPDFButton() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState("");

    function handleExport() {
        startTransition(async () => {
            try {
                setError("");
                const { base64, filename } = await generateTaxReportPDF();

                // Create invisible link and trigger download
                const link = document.createElement("a");
                link.href = base64;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to generate PDF",
                );
            }
        });
    }

    return (
        <div className="flex items-center gap-2">
            <Button
                onClick={handleExport}
                disabled={isPending}
                variant="outline"
                className="gap-2"
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <FileDown className="h-4 w-4" />
                )}
                {isPending ? "Generating…" : "Download PDF"}
            </Button>
            {error && (
                <span className="text-xs text-red-600">{error}</span>
            )}
        </div>
    );
}
