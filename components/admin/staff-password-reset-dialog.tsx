"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { resetStaffPassword } from "@/lib/actions/admin-staff.action";
import { resetStaffPasswordSchema, type ResetStaffPasswordInput } from "@/lib/validation/staff.schema";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type Props = {
    staffRecordId: string;
    staffId: string;
    onNotice: (message: string, kind: "success" | "error") => void;
};

export function StaffPasswordResetDialog({ staffRecordId, staffId, onNotice }: Props) {
    const [open, setOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const form = useForm<ResetStaffPasswordInput>({
        resolver: zodResolver(resetStaffPasswordSchema),
        defaultValues: { staffRecordId, password: "", confirmPassword: "" },
    });

    function handleOpenChange(nextOpen: boolean): void {
        setOpen(nextOpen);
        if (!nextOpen) {
            form.reset({ staffRecordId, password: "", confirmPassword: "" });
            setShowPassword(false);
        }
    }

    async function onSubmit(values: ResetStaffPasswordInput): Promise<void> {
        const result = await resetStaffPassword(values);
        if (!result.success) {
            for (const field of ["password", "confirmPassword"] as const) {
                const message = result.fieldErrors?.[field];
                if (message) form.setError(field, { message });
            }
            onNotice(result.error, "error");
            return;
        }

        handleOpenChange(false);
        onNotice(`Password reset for ${staffId}.`, "success");
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <KeyRound data-icon="inline-start" />
                    Reset password
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Reset password</DialogTitle>
                    <DialogDescription>
                        Set a new password for {staffId}. Their existing sessions will be signed out.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                        <input type="hidden" {...form.register("staffRecordId")} />
                        <FormField control={form.control} name="password" render={({ field }) => (
                            <FormItem>
                                <FormLabel>New password</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input {...field} type={showPassword ? "text" : "password"} autoComplete="new-password" className="pr-11" />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="absolute right-1 top-1/2 -translate-y-1/2"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            onClick={() => setShowPassword((visible) => !visible)}
                                        >
                                            {showPassword ? <EyeOff /> : <Eye />}
                                        </Button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Confirm password</FormLabel>
                                <FormControl><Input {...field} type={showPassword ? "text" : "password"} autoComplete="new-password" /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <p className="text-muted-foreground text-xs">Use at least 10 characters with uppercase, lowercase, a number, and a symbol.</p>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={form.formState.isSubmitting}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                                Save password
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
