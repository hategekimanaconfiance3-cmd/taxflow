"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    authorizeSimulatedTaxPayment,
    initiateSimulatedTaxPayment,
    recordTaxPayment,
} from "@/lib/actions/compliance.action";
import { createTaxPaymentSchema, type TaxPaymentInput } from "@/lib/validation/tax-payment.schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, CreditCard, CheckCircle, Info, RefreshCw, ShieldCheck } from "lucide-react";

type ProviderName = "mtn_mobile_money" | "airtel_money" | "bank_gateway";

interface TaxPaymentFormProps {
    simulatorEnabled: boolean;
    obligations: {
        id: string; taxType: string; periodKey: string; assessmentReference: string | null;
        dueDate: Date | null; currency: string; outstandingAmount: string; isSupportedForPayment: boolean;
    }[];
    payments: {
        id: string; amount: number; currency: string; provider: string | null; providerReference: string | null;
        status: string; workflowStatus: string; createdAt: Date; receiptNumber: string | null;
    }[];
}

const PAYMENT_IDEMPOTENCY_STORAGE_KEY = "taxflow-payment-idempotency-key";
const providers: { id: ProviderName; label: string; method: TaxPaymentInput["method"] }[] = [
    { id: "mtn_mobile_money", label: "MTN Mobile Money (simulated)", method: "mobile_money" },
    { id: "airtel_money", label: "Airtel Money (simulated)", method: "mobile_money" },
    { id: "bank_gateway", label: "Bank gateway (simulated)", method: "bank_transfer" },
];

function formatExactAmount(value: string): string {
    const [whole, fraction] = value.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return fraction ? `${grouped}.${fraction}` : grouped;
}

function providerLabel(provider: string | null): string {
    return providers.find((item) => item.id === provider)?.label ?? "Payment submitted for review";
}

export function TaxPaymentForm({ obligations, payments, simulatorEnabled }: TaxPaymentFormProps) {
    const router = useRouter();
    const [providerName, setProviderName] = useState<ProviderName>("mtn_mobile_money");
    const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
    const [workingPaymentId, setWorkingPaymentId] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const payable = obligations.filter((obligation) => obligation.isSupportedForPayment);
    const form = useForm<TaxPaymentInput>({
        resolver: zodResolver(createTaxPaymentSchema()),
        defaultValues: { obligationId: payable[0]?.id ?? "", method: "mobile_money", reference: "" },
    });
    const selectedObligationId = useWatch({ control: form.control, name: "obligationId" });
    const rootError = form.formState.errors.root;

    const onSubmit = async (values: TaxPaymentInput) => {
        setBusy(true);
        setNotice(null);
        try {
            const requestKey = idempotencyKey ?? sessionStorage.getItem(PAYMENT_IDEMPOTENCY_STORAGE_KEY) ?? crypto.randomUUID();
            setIdempotencyKey(requestKey);
            sessionStorage.setItem(PAYMENT_IDEMPOTENCY_STORAGE_KEY, requestKey);
            const selected = providers.find((item) => item.id === providerName);
            if (!selected) throw new Error("Choose a payment simulator.");
            const payment = await recordTaxPayment({ obligationId: values.obligationId, method: selected.method }, requestKey);
            setIdempotencyKey(null);
            sessionStorage.removeItem(PAYMENT_IDEMPOTENCY_STORAGE_KEY);
            const initiation = await initiateSimulatedTaxPayment(payment.id, providerName);
            if ("error" in initiation) {
                setNotice(initiation.error);
                router.refresh();
                return;
            }
            setWorkingPaymentId(payment.id);
            setNotice(`${selected.label} accepted the simulated request (${initiation.responseCode}). No money moved. Complete the simulation step below.`);
            form.reset({ obligationId: payable[0]?.id ?? "", method: selected.method, reference: "" });
            router.refresh();
        } catch (error) {
            form.setError("root", { message: error instanceof Error ? error.message : "Could not initiate the simulated payment." });
        } finally {
            setBusy(false);
        }
    };

    const authorize = async (paymentId: string) => {
        setBusy(true);
        setWorkingPaymentId(paymentId);
        setNotice(null);
        try {
            const result = await authorizeSimulatedTaxPayment(paymentId);
            setNotice(`Simulated provider response: ${result.status}. ${result.message}`);
            router.refresh();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "The simulated authorization could not be completed.");
        } finally {
            setBusy(false);
        }
    };

    const retryInitiation = async (paymentId: string) => {
        setBusy(true);
        setWorkingPaymentId(paymentId);
        setNotice(null);
        try {
            const result = await initiateSimulatedTaxPayment(paymentId, providerName);
            if ("error" in result) {
                setNotice(result.error);
                return;
            }
            setNotice(`${providerLabel(result.provider)} returned ${result.status} (${result.responseCode}). No money moved.`);
            router.refresh();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "The simulated provider could not be reached.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold"><CreditCard className="h-4 w-4" />Make Tax Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                        {simulatorEnabled ? <><strong>SIMULATED PAYMENT ENVIRONMENT.</strong> No actual payment is sent and no real mobile money PIN is requested or stored.</> : <><strong>SIMULATED PROVIDERS ARE DISABLED.</strong> This deployment cannot initiate or retry simulated payments. No money will be moved.</>}
                    </div>
                    {(rootError || notice) && <div role="status" className={`rounded-md border px-3 py-2 text-sm ${rootError ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{rootError?.message ?? notice}</div>}
                    {payable.length === 0 && <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-700"><Info className="h-4 w-4 shrink-0" /><span>No authorized RWF obligation is currently available for payment.</span></div>}
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField control={form.control} name="obligationId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Official assessment and tax period</FormLabel>
                                    <Select value={field.value} onValueChange={field.onChange} disabled={!simulatorEnabled || payable.length === 0}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Choose a payable assessment" /></SelectTrigger></FormControl>
                                        <SelectContent>{payable.map((obligation) => <SelectItem key={obligation.id} value={obligation.id}>{obligation.taxType} · {obligation.periodKey} · {formatExactAmount(obligation.outstandingAmount)} {obligation.currency}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            {payable.filter((obligation) => obligation.id === selectedObligationId).map((obligation) => <div key={obligation.id} className="rounded-md border bg-muted/30 px-3 py-3 text-sm">
                                <p className="text-muted-foreground">Full outstanding amount · {obligation.assessmentReference}</p>
                                <p className="mt-1 font-mono text-lg font-semibold">{formatExactAmount(obligation.outstandingAmount)} {obligation.currency}</p>
                                {obligation.dueDate && <p className="mt-1 text-xs text-muted-foreground">Due {new Date(obligation.dueDate).toLocaleDateString()}</p>}
                                <p className="mt-1 text-xs text-muted-foreground">The server verifies the full balance from the approved obligation; partial payments are rejected.</p>
                            </div>)}
                            <div className="space-y-2">
                                <FormLabel htmlFor="payment-simulator">Provider simulator</FormLabel>
                                <Select value={providerName} onValueChange={(value) => {
                                    const selected = providers.find((item) => item.id === value);
                                    if (selected) { setProviderName(selected.id); form.setValue("method", selected.method); }
                                }} disabled={!simulatorEnabled || busy || payable.length === 0}>
                                    <SelectTrigger id="payment-simulator"><SelectValue /></SelectTrigger>
                                    <SelectContent>{providers.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" disabled={!simulatorEnabled || payable.length === 0 || busy || !selectedObligationId} className="w-full gap-2">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                Initiate simulated full payment
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Your payment history</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {payments.length === 0 ? <p className="text-sm text-muted-foreground">You have no recorded tax payments.</p> : payments.map((payment) => {
                        const awaitingAuthorization = payment.status === "pending" && payment.workflowStatus === "PAYMENT_INITIATED" && Boolean(payment.providerReference);
                        const initiationCanRetry = payment.status === "pending" && payment.workflowStatus === "AWAITING_CONFIRMATION" && !payment.providerReference;
                        return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                            <div className="min-w-48">
                                <p className="font-medium">{providerLabel(payment.provider)}</p>
                                <p className="font-mono text-xs text-muted-foreground">{payment.providerReference ?? "Awaiting provider initiation"}</p>
                                <p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-mono font-semibold">{payment.amount.toLocaleString()} {payment.currency}</p>
                                <p className="text-xs">{payment.workflowStatus.replaceAll("_", " ")}</p>
                                {payment.receiptNumber && <p className="text-xs text-emerald-700">Verified receipt · {payment.receiptNumber}</p>}
                            </div>
                            {simulatorEnabled && awaitingAuthorization && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void authorize(payment.id)}>
                                {busy && workingPaymentId === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Complete simulated authorization
                            </Button>}
                            {simulatorEnabled && initiationCanRetry && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void retryInitiation(payment.id)}>
                                {busy && workingPaymentId === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Retry simulator initiation
                            </Button>}
                        </div>;
                    })}
                    <Button type="button" variant="ghost" size="sm" onClick={() => router.refresh()} className="gap-2"><RefreshCw className="h-4 w-4" />Refresh payment status</Button>
                </CardContent>
            </Card>
        </div>
    );
}
