"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Loader2, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";

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

const resetPasswordSchema = z
    .object({
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [success, setSuccess] = useState(false);

    const form = useForm<ResetPasswordValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { password: "", confirmPassword: "" },
    });

    const isSubmitting = form.formState.isSubmitting;

    const onSubmit = async (values: ResetPasswordValues) => {
        if (!token) {
            form.setError("password", { message: "Invalid or missing reset token" });
            return;
        }

        const { error } = await authClient.resetPassword({
            newPassword: values.password,
            token,
        });

        if (error) {
            form.setError("password", {
                message: error.message ?? "Failed to reset password",
            });
            return;
        }

        setSuccess(true);
    };

    // ── No token ───────────────────────────────────
    if (!token) {
        return (
            <div className="flex w-full flex-col items-center justify-center">
                <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
                    <CardContent className="px-8 py-10 bg-white text-center space-y-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            Invalid Reset Link
                        </h2>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            This password reset link is invalid or has expired.
                            Please request a new one.
                        </p>
                        <Link href="/forgot-password">
                            <Button
                                variant="outline"
                                className="mt-2 w-full h-10 border-gray-200"
                            >
                                Request New Link
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Success state ──────────────────────────────
    if (success) {
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
                            Password Reset Successful
                        </h2>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            Your password has been updated. You can now sign in
                            with your new password.
                        </p>
                        <Button
                            onClick={() => router.push("/sign-in")}
                            className="mt-2 w-full h-10 bg-gray-900 text-white hover:bg-gray-800"
                        >
                            Sign in
                        </Button>
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
                        Reset Password
                    </p>
                    <p className="text-xs text-gray-400">
                        Choose a strong new password for your account
                    </p>
                </div>

                <CardContent className="px-8 py-6 space-y-5 bg-white">
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-5"
                        >
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-semibold text-gray-700">
                                            New Password
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    {...field}
                                                    type={showPassword ? "text" : "password"}
                                                    className="h-10 border-gray-200 bg-gray-50 focus:bg-white pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword((v) => !v)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                    tabIndex={-1}
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-semibold text-gray-700">
                                            Confirm Password
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    {...field}
                                                    type={showConfirm ? "text" : "password"}
                                                    className="h-10 border-gray-200 bg-gray-50 focus:bg-white pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirm((v) => !v)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                    tabIndex={-1}
                                                >
                                                    {showConfirm ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
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
                                    "Reset Password"
                                )}
                            </Button>
                        </form>
                    </Form>

                    <p className="text-center text-sm text-gray-500">
                        <Link
                            href="/sign-in"
                            className="inline-flex items-center gap-1 font-medium text-blue-500 hover:underline"
                        >
                            <ArrowLeft className="h-3 w-3" />
                            Back to Sign in
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
