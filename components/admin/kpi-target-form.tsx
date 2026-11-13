"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateKpiTargets } from "@/lib/actions/kpi-targets.action";
import { Target, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface KpiTargetFormProps {
    vatTarget: number;
    traderTarget: number;
    complianceTarget: number;
    targetMonth: string;
}

export function KpiTargetForm({
    vatTarget,
    traderTarget,
    complianceTarget,
    targetMonth,
}: KpiTargetFormProps) {
    const [isPending, startTransition] = useTransition();
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string>("");

    // Form state
    const [month, setMonth] = useState(targetMonth);
    const [vat, setVat] = useState(String(vatTarget));
    const [traders, setTraders] = useState(String(traderTarget));
    // compliance stored as 0–1, displayed as 0–100
    const [compliance, setCompliance] = useState(
        String(Math.round(complianceTarget * 100))
    );

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("idle");
        setErrorMsg("");

        startTransition(async () => {
            try {
                await updateKpiTargets({
                    vatTarget: parseInt(vat, 10) || 0,
                    traderTarget: parseInt(traders, 10) || 0,
                    complianceTarget: (parseFloat(compliance) || 90) / 100,
                    targetMonth: month,
                });
                setStatus("success");
            } catch (err) {
                setStatus("error");
                setErrorMsg(err instanceof Error ? err.message : "Failed to save targets");
            }
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-primary" />
                    Update Targets
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Target Month */}
                    <div className="space-y-1.5">
                        <Label htmlFor="kpi-month">Target Month</Label>
                        <Input
                            id="kpi-month"
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            required
                            disabled={isPending}
                        />
                    </div>

                    {/* VAT Revenue Target */}
                    <div className="space-y-1.5">
                        <Label htmlFor="kpi-vat">Monthly VAT Revenue Target (RWF)</Label>
                        <Input
                            id="kpi-vat"
                            type="number"
                            min={0}
                            step={1}
                            placeholder="20000000"
                            value={vat}
                            onChange={(e) => setVat(e.target.value)}
                            required
                            disabled={isPending}
                        />
                    </div>

                    {/* Trader Registration Target */}
                    <div className="space-y-1.5">
                        <Label htmlFor="kpi-traders">New Trader Registrations Target</Label>
                        <Input
                            id="kpi-traders"
                            type="number"
                            min={0}
                            step={1}
                            placeholder="100"
                            value={traders}
                            onChange={(e) => setTraders(e.target.value)}
                            required
                            disabled={isPending}
                        />
                    </div>

                    {/* Compliance Rate Target */}
                    <div className="space-y-1.5">
                        <Label htmlFor="kpi-compliance">Compliance Rate Target (%)</Label>
                        <Input
                            id="kpi-compliance"
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            placeholder="90"
                            value={compliance}
                            onChange={(e) => setCompliance(e.target.value)}
                            required
                            disabled={isPending}
                        />
                        <p className="text-xs text-muted-foreground">Enter a whole number between 1 and 100.</p>
                    </div>

                    {/* Feedback messages */}
                    {status === "success" && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            KPI targets saved successfully.
                        </div>
                    )}
                    {status === "error" && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {errorMsg || "Failed to save targets. Please try again."}
                        </div>
                    )}

                    <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Save Targets"
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
