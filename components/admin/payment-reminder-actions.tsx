"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    sendPaymentReminder,
    sendBulkPaymentReminders,
} from "@/lib/actions/admin-payment-reminder.action";
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
import { Bell, Send, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Send individual reminder
// ---------------------------------------------------------------------------

export function SendReminderButton({
    traderId,
    amount,
}: {
    traderId: string;
    amount: number;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleSend() {
        startTransition(async () => {
            await sendPaymentReminder(traderId, amount);
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
            Remind
        </Button>
    );
}

// ---------------------------------------------------------------------------
// Bulk reminder dialog
// ---------------------------------------------------------------------------

export function BulkReminderDialog({ count }: { count: number }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState<number | null>(null);

    function handleSend() {
        startTransition(async () => {
            const res = await sendBulkPaymentReminders();
            setResult(res.sent);
            router.refresh();
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setResult(null); }}>
            <DialogTrigger asChild>
                <Button className="gap-1.5">
                    <Send className="h-4 w-4" />
                    Send Reminders to All ({count})
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Send Bulk Reminders</DialogTitle>
                    <DialogDescription>
                        Send a VAT payment reminder notification to all {count}{" "}
                        traders with outstanding balances.
                    </DialogDescription>
                </DialogHeader>
                {result !== null ? (
                    <p className="text-sm text-emerald-600 bg-emerald-50 rounded-md px-3 py-2">
                        ✓ Reminders sent to {result} trader{result !== 1 ? "s" : ""}.
                    </p>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {result !== null ? "Done" : "Cancel"}
                    </Button>
                    {result === null && (
                        <Button onClick={handleSend} disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Send All
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
