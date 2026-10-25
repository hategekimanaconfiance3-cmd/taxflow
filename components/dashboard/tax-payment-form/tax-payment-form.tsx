"use client";

import { useMemo, useRef, type FormEventHandler } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordTaxPayment } from "@/lib/actions/compliance.action";
import {
    createTaxPaymentSchema,
    type TaxPaymentInput,
} from "@/lib/validation/tax-payment.schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Loader2, CreditCard, CheckCircle, Info } from "lucide-react";

interface TaxPaymentFormProps {
    outstanding: number;
}

const PAYMENT_IDEMPOTENCY_STORAGE_KEY = "taxflow-payment-idempotency-key";

export function TaxPaymentForm({ outstanding }: TaxPaymentFormProps) {
    const router = useRouter();
    const idempotencyKey = useRef<string | null>(null);
    const noTaxDue = outstanding <= 0;

    // Build a schema whose max constraint is tied to current outstanding
    const schema = useMemo(
        () => createTaxPaymentSchema(Math.max(1, outstanding)),
        [outstanding],
    );

    const form = useForm<TaxPaymentInput>({
        resolver: zodResolver(schema),
        defaultValues: {
            amount: undefined as unknown as number,
            method: "mobile_money",
            reference: "",
        },
    });

    const {
        formState: { isSubmitting },
        setError,
    } = form;

    const onSubmit = async (values: TaxPaymentInput) => {
        try {
            const paymentRequestKey =
                idempotencyKey.current ??
                sessionStorage.getItem(PAYMENT_IDEMPOTENCY_STORAGE_KEY) ??
                crypto.randomUUID();
            idempotencyKey.current = paymentRequestKey;
            sessionStorage.setItem(PAYMENT_IDEMPOTENCY_STORAGE_KEY, paymentRequestKey);
            await recordTaxPayment({
                amount: values.amount,
                method: values.method,
                reference: values.reference?.trim() || undefined,
            }, paymentRequestKey);

            idempotencyKey.current = null;
            sessionStorage.removeItem(PAYMENT_IDEMPOTENCY_STORAGE_KEY);
            form.reset();
            // Show success via root-level message
            form.setError("root", {
                type: "success",
                message: `Payment of ${values.amount.toLocaleString()} RWF submitted for RRA verification`,
            });
            router.refresh();
        } catch (err) {
            setError("root", {
                message:
                    err instanceof Error
                        ? err.message
                        : "Failed to record payment",
            });
        }
    };

    const handleFormSubmit: FormEventHandler<HTMLFormElement> = (event) => {
        void form.handleSubmit(onSubmit)(event);
    };

    const rootError = form.formState.errors.root;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Make Tax Payment
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Root-level messages (success / server error) */}
                {rootError && (
                    <div
                        className={`text-sm rounded-md px-3 py-2 ${
                            rootError.type === "success"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                    >
                        {rootError.message}
                    </div>
                )}

                {/* No tax due — block the form */}
                {noTaxDue && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-3 text-sm text-blue-700 flex items-center gap-2">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>
                            No tax is currently outstanding. You&apos;re all
                            caught up!
                        </span>
                    </div>
                )}

                {/* Outstanding balance indicator */}
                {outstanding > 0 && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                        Outstanding tax:{" "}
                        <strong className="font-mono">
                            {outstanding.toLocaleString()} RWF
                        </strong>
                    </div>
                )}

                <Form {...form}>
                    <form
                        onSubmit={handleFormSubmit}
                        className="space-y-4"
                    >
                        {/* Amount */}
                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Amount (RWF)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            placeholder="Enter payment amount"
                                            disabled={noTaxDue}
                                            min={1}
                                            max={outstanding > 0 ? outstanding : undefined}
                                            className="font-mono"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(
                                                    val === ""
                                                        ? undefined
                                                        : parseInt(val, 10),
                                                );
                                            }}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {outstanding > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs h-6 px-2"
                                onClick={() =>
                                    form.setValue("amount", outstanding, {
                                        shouldValidate: true,
                                    })
                                }
                            >
                                Pay full balance
                            </Button>
                        )}

                        {/* Payment Method */}
                        <FormField
                            control={form.control}
                            name="method"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Payment Method</FormLabel>
                                    <Select
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        disabled={noTaxDue}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="mobile_money">
                                                Mobile Money
                                            </SelectItem>
                                            <SelectItem value="bank_transfer">
                                                Bank Transfer
                                            </SelectItem>
                                            <SelectItem value="cash">
                                                Cash
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Reference */}
                        <FormField
                            control={form.control}
                            name="reference"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Reference / Receipt No.{" "}
                                        <span className="text-muted-foreground font-normal">
                                            (optional)
                                        </span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="e.g. TXN-123456"
                                            className="font-mono"
                                            disabled={noTaxDue}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button
                            type="submit"
                            disabled={noTaxDue || isSubmitting}
                            className="w-full gap-2"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle className="h-4 w-4" />
                            )}
                            Record Payment
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
