"use client";

import { useState, useTransition } from "react";
import { lookupBuyer } from "@/lib/actions/transaction.action";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle, XCircle } from "lucide-react";

export interface BuyerInfo {
    id: string;
    name: string;
    businessName: string | null;
    tinNumber: string | null;
    role: string;
    clearanceStatus: string;
    compliancePct: number;
    isEligible: boolean;
    reason: string;
}

interface BuyerLookupProps {
    onBuyerFound: (buyer: BuyerInfo) => void;
    onBuyerCleared: () => void;
}

export function BuyerLookup({ onBuyerFound, onBuyerCleared }: BuyerLookupProps) {
    const [isPending, startTransition] = useTransition();
    const [tin, setTin] = useState("");
    const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
    const [error, setError] = useState("");

    function handleVerify() {
        if (!tin.trim()) return;

        startTransition(async () => {
            try {
                setError("");
                const result = await lookupBuyer(tin.trim());
                setBuyer(result);
                onBuyerFound(result);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to lookup buyer",
                );
                setBuyer(null);
                onBuyerCleared();
            }
        });
    }

    function handleClear() {
        setTin("");
        setBuyer(null);
        setError("");
        onBuyerCleared();
    }

    return (
        <div className="space-y-3">
            {/* TIN input + verify */}
            <div className="flex gap-2">
                <div className="flex-1">
                    <Input
                        placeholder="Enter Buyer TIN"
                        value={tin}
                        onChange={(e) => {
                            setTin(e.target.value);
                            if (buyer) handleClear();
                        }}
                        className="font-mono"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={handleVerify}
                    disabled={isPending || !tin.trim()}
                    className="gap-2"
                >
                    {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Search className="h-3.5 w-3.5" />
                    )}
                    Verify
                </Button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 border border-red-200">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Buyer info display */}
            {buyer && (
                <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            Buyer Info
                        </span>
                        {buyer.isEligible ? (
                            <Badge
                                variant="outline"
                                className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200 gap-1"
                            >
                                <CheckCircle className="h-3 w-3" />
                                Eligible
                            </Badge>
                        ) : (
                            <Badge
                                variant="outline"
                                className="text-xs bg-red-50 text-red-600 border-red-200 gap-1"
                            >
                                <XCircle className="h-3 w-3" />
                                Not Eligible
                            </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground">Name</p>
                            <p className="font-medium">
                                {buyer.businessName ?? buyer.name}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Category
                            </p>
                            <Badge
                                variant="outline"
                                className="text-xs capitalize"
                            >
                                {buyer.role}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Clearance
                            </p>
                            <Badge
                                variant="outline"
                                className="text-xs capitalize"
                            >
                                {buyer.clearanceStatus.replace("_", " ")}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Tax Compliance
                            </p>
                            <Badge
                                variant="outline"
                                className={`text-xs font-mono ${buyer.compliancePct >= 95
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                        : buyer.compliancePct >= 50
                                            ? "bg-amber-50 text-amber-600 border-amber-200"
                                            : "bg-red-50 text-red-600 border-red-200"
                                    }`}
                            >
                                {buyer.compliancePct}%
                            </Badge>
                        </div>
                    </div>

                    {!buyer.isEligible && buyer.reason && (
                        <p className="text-xs text-red-500">{buyer.reason}</p>
                    )}
                </div>
            )}
        </div>
    );
}
