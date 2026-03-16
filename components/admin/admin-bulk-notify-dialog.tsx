"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";
import { sendBulkNotification } from "@/lib/actions/admin-notification.action";

const TARGET_GROUPS = [
    { value: "all", label: "All Traders" },
    { value: "manufacturer", label: "Manufacturers" },
    { value: "wholesaler", label: "Wholesalers" },
    { value: "retailer", label: "Retailers" },
    { value: "non_compliant", label: "Non-Compliant Traders" },
];

export function AdminBulkNotifyDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [target, setTarget] = useState("all");
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [result, setResult] = useState<{ sent: number } | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSend() {
        startTransition(async () => {
            const res = await sendBulkNotification(
                target as "all" | "manufacturer" | "wholesaler" | "retailer" | "non_compliant",
                title,
                message,
            );
            setResult(res);
            router.refresh();
        });
    }

    function handleClose() {
        setOpen(false);
        setTitle("");
        setMessage("");
        setTarget("all");
        setResult(null);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <Send className="h-3.5 w-3.5" />
                    Send Bulk Notification
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Send Bulk Notification</DialogTitle>
                </DialogHeader>

                {result ? (
                    <div className="py-6 text-center">
                        <p className="text-lg font-semibold text-emerald-600">
                            ✓ Sent to {result.sent} trader
                            {result.sent !== 1 ? "s" : ""}
                        </p>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={handleClose}
                        >
                            Done
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Target Group</Label>
                                <Select
                                    value={target}
                                    onValueChange={setTarget}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TARGET_GROUPS.map((g) => (
                                            <SelectItem
                                                key={g.value}
                                                value={g.value}
                                            >
                                                {g.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Title</Label>
                                <Input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. VAT Filing Deadline Reminder"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Message</Label>
                                <Textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Notification content..."
                                    rows={4}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={
                                    isPending ||
                                    !title.trim() ||
                                    !message.trim()
                                }
                                className="gap-2"
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Send className="h-3.5 w-3.5" />
                                )}
                                Send
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
