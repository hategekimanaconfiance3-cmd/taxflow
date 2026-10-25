"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const forgotPasswordSchema = z.object({
    email: z.string().email("Enter a valid email address"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForgotPasswordForm() {
    const [sent, setSent] = useState(false);

    const form = useForm<ForgotPasswordValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: { email: "" },
    });

    const isSubmitting = form.formState.isSubmitting;

    const onSubmit = async (values: ForgotPasswordValues) => {
        const requestPasswordReset = authClient.forgetPassword as unknown as (input: {
            email: string;
            redirectTo: string;
        }) => Promise<{ error?: { message?: string } | null }>;
        const { error } = await requestPasswordReset({
            email: values.email,
            redirectTo: "/reset-password",
        });

        if (error) {
            form.setError("email", { message: error.message ?? "Something went wrong" });
            return;
        }

        setSent(true);
    };

    // ── Success state ──────────────────────────────
    if (sent) {
        return (
            <div className="flex w-full flex-col items-center justify-center">
                <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
                    <CardContent className="px-8 py-10 bg-white text-center space-y-4">
                        <div className="flex justify-center">
                            <div className="rounded-full bg-emerald-50 p-3">
                                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            </div>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Check your email
                        </h2>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            If an account exists with that email, we sent a password
                            reset link. Check your inbox and follow the instructions.
                        </p>
                        <Link href="/sign-in">
                            <Button
                                variant="outline"
                                className="mt-2 w-full h-10 border-gray-200"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Sign in
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Form state ─────────────────────────────────
    return (
        <div className="flex w-full flex-col items-center justify-center">
            <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
                <div className="border-b border-gray-100 bg-white px-8 py-5 text-center space-y-1">
                    <p className="text-sm font-medium text-gray-500 tracking-wide">
                        Forgot Password
                    </p>
                    <p className="text-xs text-gray-400">
                        Enter your email to receive a reset link
                    </p>
                </div>

                <CardContent className="px-8 py-6 space-y-5 bg-white">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-semibold text-gray-700">
                                            Email Address
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                type="email"
                                                placeholder="you@example.com"
                                                className="h-10 border-gray-200 bg-gray-50 focus:bg-white"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full h-10 bg-gray-900 text-white hover:bg-gray-800"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin" />
                                ) : (
                                    "Send Reset Link"
                                )}
                            </Button>
                        </form>
                    </Form>

                    <p className="text-center text-sm text-gray-500">
                        Remember your password?{" "}
                        <Link
                            href="/sign-in"
                            className="font-medium text-blue-500 hover:underline"
                        >
                            Sign in
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
