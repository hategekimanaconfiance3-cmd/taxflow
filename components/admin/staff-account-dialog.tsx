"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, UserPlus, WandSparkles } from "lucide-react";
import { createStaffAccount } from "@/lib/actions/admin-staff.action";
import {
    staffAccountSchema,
    STAFF_ROLE_OPTIONS,
    type StaffAccountFields,
    type StaffAccountInput,
} from "@/lib/validation/staff.schema";
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
    onNotice: (message: string, kind: "success" | "error") => void;
    onCreated: () => void;
};

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*+-=?";
const ALL_CHARACTERS = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS;

function secureIndex(max: number): number {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
}

function generatePassword(): string {
    const characters = [
        LOWERCASE[secureIndex(LOWERCASE.length)],
        UPPERCASE[secureIndex(UPPERCASE.length)],
        DIGITS[secureIndex(DIGITS.length)],
        SYMBOLS[secureIndex(SYMBOLS.length)],
    ];
    while (characters.length < 20) {
        characters.push(ALL_CHARACTERS[secureIndex(ALL_CHARACTERS.length)]);
    }
    for (let index = characters.length - 1; index > 0; index -= 1) {
        const swapIndex = secureIndex(index + 1);
        [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }
    return characters.join("");
}

export function StaffAccountDialog({ onNotice, onCreated }: Props) {
    const [open, setOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const form = useForm<StaffAccountInput>({
        resolver: zodResolver(staffAccountSchema),
        defaultValues: {
            fullName: "",
            email: "",
            staffId: "",
            department: "",
            roles: ["compliance_officer"],
            password: "",
            confirmPassword: "",
        },
    });

    function handleOpenChange(nextOpen: boolean): void {
        setOpen(nextOpen);
        if (!nextOpen) {
            form.reset();
            setShowPassword(false);
        }
    }

    function handleGeneratePassword(): void {
        const password = generatePassword();
        form.setValue("password", password, { shouldDirty: true, shouldValidate: true });
        form.setValue("confirmPassword", password, { shouldDirty: true, shouldValidate: true });
        setShowPassword(true);
    }

    async function onSubmit(values: StaffAccountInput): Promise<void> {
        const result = await createStaffAccount(values);
        if (!result.success) {
            for (const field of Object.keys(result.fieldErrors ?? {}) as StaffAccountFields[]) {
                const message = result.fieldErrors?.[field];
                if (message) form.setError(field, { message });
            }
            onNotice(result.error, "error");
            return;
        }

        handleOpenChange(false);
        onCreated();
        onNotice(`Staff account ${result.staffId} created successfully.`, "success");
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <UserPlus data-icon="inline-start" />
                    Add staff member
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add staff member</DialogTitle>
                    <DialogDescription>
                        Create an RRA login. The staff member can sign in with the Staff ID and password below.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField control={form.control} name="fullName" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Full name</FormLabel>
                                    <FormControl><Input autoComplete="name" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="email" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="staffId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Staff ID</FormLabel>
                                    <FormControl><Input autoCapitalize="characters" placeholder="e.g. CO-014" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="department" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Department</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="roles" render={({ field }) => (
                                <FormItem className="sm:col-span-2">
                                    <FormLabel>Staff role assignments</FormLabel>
                                    <div className="space-y-2">
                                        {STAFF_ROLE_OPTIONS.map((role) => (
                                            <label key={role.value} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50">
                                                <input type="checkbox" className="mt-1 size-4 accent-primary" checked={field.value.includes(role.value)}
                                                    onChange={(event) => {
                                                        const checked = event.target.checked;
                                                        if (role.value === "super_admin" && checked) field.onChange([role.value]);
                                                        else if (field.value.includes("super_admin")) field.onChange(checked ? [role.value] : []);
                                                        else field.onChange(checked ? [...field.value, role.value] : field.value.filter((value) => value !== role.value));
                                                    }} />
                                                <span><span className="text-sm font-medium">{role.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{role.permissions}</span></span>
                                            </label>
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">Initial password</p>
                            <Button type="button" variant="outline" size="sm" onClick={handleGeneratePassword}>
                                <WandSparkles data-icon="inline-start" />
                                Generate strong password
                            </Button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField control={form.control} name="password" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
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
                        </div>
                        <p className="text-muted-foreground text-xs">Use at least 10 characters with uppercase, lowercase, a number, and a symbol.</p>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={form.formState.isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                                Create account
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
