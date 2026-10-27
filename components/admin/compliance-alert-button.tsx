"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendComplianceAlert } from "@/lib/actions/admin-compliance-alert.action";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";

export function SendAlertButton({
    traderId,
    alertType,
    description,
}: {
    traderId: string;
    alertType: string;
    description: string;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleSend() {
        startTransition(async () => {
            await sendComplianceAlert(traderId, alertType, description);
            router.refresh();
        });
    }

    return (
        <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={handleSend}
            disabled={isPending}
        >
            {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
                <Bell className="h-3 w-3" />
            )}
            Notify
        </Button>
    );
}
