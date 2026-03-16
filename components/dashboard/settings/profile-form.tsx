"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/actions/settings.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";

interface ProfileFormProps {
    name: string;
    businessName: string;
}

export function ProfileForm({ name, businessName }: ProfileFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [formName, setFormName] = useState(name);
    const [formBusiness, setFormBusiness] = useState(businessName);
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    const hasChanges = formName !== name || formBusiness !== businessName;

    function handleSave() {
        if (!hasChanges) return;

        startTransition(async () => {
            try {
                setMessage(null);
                await updateProfile({
                    name: formName.trim() || undefined,
                    businessName: formBusiness.trim() || undefined,
                });
                setMessage({ text: "Profile updated!", type: "success" });
                router.refresh();
            } catch (err) {
                setMessage({
                    text:
                        err instanceof Error
                            ? err.message
                            : "Failed to update profile",
                    type: "error",
                });
            }
        });
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                    Edit Profile
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div
                        className={`text-sm rounded-md px-3 py-2 ${message.type === "success"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="name">Display Name</Label>
                        <Input
                            id="name"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="businessName">Business Name</Label>
                        <Input
                            id="businessName"
                            value={formBusiness}
                            onChange={(e) => setFormBusiness(e.target.value)}
                        />
                    </div>
                </div>

                <Button
                    onClick={handleSave}
                    disabled={isPending || !hasChanges}
                    className="gap-2"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    Save Changes
                </Button>
            </CardContent>
        </Card>
    );
}
