"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSystemConfig } from "@/lib/actions/system-config.action";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Loader2 } from "lucide-react";

interface ConfigItem {
    key: "compliance_threshold" | "vat_rate" | "dispute_window_hours" | "buyer_confirmation_window_hours";
    label: string;
    description: string;
    currentValue: string;
    displayValue: string;
    unit: string;
    inputType: "percentage" | "hours";
}

interface SystemConfigEditorProps {
    complianceThreshold: number;
    vatRate: number;
    disputeWindowHours: number;
    buyerConfirmationWindowHours: number;
}

export function SystemConfigEditor({
    complianceThreshold,
    vatRate,
    disputeWindowHours,
    buyerConfirmationWindowHours,
}: SystemConfigEditorProps) {
    const items: ConfigItem[] = [
        {
            key: "compliance_threshold",
            label: "Compliance Threshold",
            description: "Minimum payment percentage to be considered compliant",
            currentValue: complianceThreshold.toString(),
            displayValue: `${Math.round(complianceThreshold * 100)}%`,
            unit: "%",
            inputType: "percentage",
        },
        {
            key: "vat_rate",
            label: "VAT Rate",
            description: "Standard VAT rate applied to transactions",
            currentValue: vatRate.toString(),
            displayValue: `${Math.round(vatRate * 100)}%`,
            unit: "%",
            inputType: "percentage",
        },
        {
            key: "dispute_window_hours",
            label: "Dispute Resolution Window",
            description: "Hours allowed for counterparty response",
            currentValue: disputeWindowHours.toString(),
            displayValue: `${disputeWindowHours}h`,
            unit: "hours",
            inputType: "hours",
        },
        {
            key: "buyer_confirmation_window_hours",
            label: "Buyer Confirmation Window",
            description: "Hours buyers have to confirm a purchase before reserved stock is released",
            currentValue: buyerConfirmationWindowHours.toString(),
            displayValue: `${buyerConfirmationWindowHours}h`,
            unit: "hours",
            inputType: "hours",
        },
    ];

    return (
        <div className="space-y-3">
            {items.map((item) => (
                <ConfigRow key={item.key} item={item} />
            ))}
        </div>
    );
}

function ConfigRow({ item }: { item: ConfigItem }) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function startEditing(): void {
        if (item.inputType === "percentage") {
            // Show as percentage (e.g. 95) for user-friendly editing
            setInputValue((parseFloat(item.currentValue) * 100).toString());
        } else {
            setInputValue(item.currentValue);
        }
        setError(null);
        setIsEditing(true);
    }

    function cancelEditing(): void {
        setIsEditing(false);
        setError(null);
    }

    function handleSave(): void {
        let valueToSave = inputValue.trim();

        // Convert percentage input (e.g. "95") to decimal (e.g. "0.95")
        if (item.inputType === "percentage") {
            const pct = parseFloat(valueToSave);
            if (isNaN(pct)) {
                setError("Enter a valid number");
                return;
            }
            valueToSave = (pct / 100).toString();
        }

        startTransition(async () => {
            try {
                await updateSystemConfig({
                    key: item.key,
                    value: valueToSave,
                });
                setIsEditing(false);
                setError(null);
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to update",
                );
            }
        });
    }

    return (
        <div className="rounded-lg border p-3">
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                        {item.description}
                    </p>
                </div>

                {isEditing ? (
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                className="w-24 h-8 text-right font-mono text-sm"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                step={item.inputType === "percentage" ? "1" : "1"}
                                min={0}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSave();
                                    if (e.key === "Escape") cancelEditing();
                                }}
                            />
                            <span className="text-xs text-muted-foreground">
                                {item.unit}
                            </span>
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={handleSave}
                            disabled={isPending}
                        >
                            {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Check className="h-3.5 w-3.5" />
                            )}
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={cancelEditing}
                            disabled={isPending}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                            {item.displayValue}
                        </Badge>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={startEditing}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {error && (
                <p className="text-xs text-red-500 mt-2">{error}</p>
            )}
        </div>
    );
}
