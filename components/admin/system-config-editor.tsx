"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSystemConfig, updateSellThroughThresholdAction, type ActiveSellThroughThreshold } from "@/lib/actions/system-config.action";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X, Loader2, ShieldCheck } from "lucide-react";

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
    sellThroughThreshold: ActiveSellThroughThreshold;
}

export function SystemConfigEditor({
    complianceThreshold,
    vatRate,
    disputeWindowHours,
    buyerConfirmationWindowHours,
    sellThroughThreshold,
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
            <SellThroughThresholdRow threshold={sellThroughThreshold} />
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

function SellThroughThresholdRow({ threshold }: { threshold: ActiveSellThroughThreshold }) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [reason, setReason] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    function startEditing(): void {
        setInputValue(threshold.thresholdPercent.toString());
        setReason("");
        setError(null);
        setSaved(false);
        setIsEditing(true);
    }

    function cancelEditing(): void {
        setIsEditing(false);
        setError(null);
    }

    function handleSave(): void {
        const pct = parseInt(inputValue.trim(), 10);
        if (isNaN(pct) || pct < 1 || pct > 100) {
            setError("Enter a whole number between 1 and 100");
            return;
        }
        if (!reason.trim() || reason.trim().length < 5) {
            setError("Please provide a reason (at least 5 characters)");
            return;
        }

        startTransition(async () => {
            try {
                await updateSellThroughThresholdAction({
                    thresholdPercent: pct,
                    reason: reason.trim(),
                });
                setSaved(true);
                setIsEditing(false);
                setError(null);
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update");
            }
        });
    }

    const lastChangedAt = threshold.effectiveAt.getTime() > 0
        ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(threshold.effectiveAt)
        : null;

    return (
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3">
            <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <p className="text-sm font-medium">Stock Sell-Through Threshold</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Minimum percentage of previously received stock a trader must sell before restocking the same product.
                        Applies to all traders and all restocking channels.
                    </p>
                    {lastChangedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                            {threshold.isBootstrap ? "System default — set" : "Last changed"}{" "}
                            {lastChangedAt}
                            {!threshold.isBootstrap && threshold.reason !== "System default" && (
                                <span className="ml-1 italic">&ldquo;{threshold.reason}&rdquo;</span>
                            )}
                        </p>
                    )}
                </div>

                {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                className="w-20 h-8 text-right font-mono text-sm"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                step="1"
                                min={1}
                                max={100}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") cancelEditing();
                                }}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
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
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="font-mono border-blue-200 text-blue-700 bg-white">
                            {threshold.thresholdPercent}%
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

            {isEditing && (
                <div className="mt-3 space-y-2">
                    <Textarea
                        placeholder="Reason for change (required, e.g. 'Raising threshold to 80% per Q4 compliance review')"
                        className="text-xs min-h-[60px] resize-none"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                        This change takes effect immediately across all restocking channels. The reason is recorded in the immutable audit trail.
                    </p>
                </div>
            )}

            {saved && !isEditing && (
                <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Threshold updated successfully. All future restocking requests will use the new value.
                </p>
            )}

            {error && (
                <p className="text-xs text-red-500 mt-2">{error}</p>
            )}
        </div>
    );
}
