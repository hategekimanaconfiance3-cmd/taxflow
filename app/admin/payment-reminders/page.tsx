import { requireRRASession } from "@/lib/auth-guard";
import { getTradersWithUnpaidVat } from "@/lib/actions/admin-payment-reminder.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
    SendReminderButton,
    BulkReminderDialog,
} from "@/components/admin/payment-reminder-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CreditCard, DollarSign } from "lucide-react";
import Link from "next/link";

export default async function PaymentRemindersPage() {
    await requireRRASession("compliance_officer");
    const unpaid = await getTradersWithUnpaidVat();

    const totalOutstanding = unpaid.reduce((s, t) => s + t.outstanding, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Payment Reminders
                    </h1>
                    <p className="text-muted-foreground">
                        Traders with outstanding VAT balances.
                    </p>
                </div>
                {unpaid.length > 0 && <BulkReminderDialog count={unpaid.length} />}
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Traders with Balances
                            </p>
                            <p className="text-2xl font-bold">{unpaid.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <DollarSign className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Total Outstanding
                            </p>
                            <p className="text-2xl font-bold">
                                {formatRWF(totalOutstanding)}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CreditCard className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Average Balance
                            </p>
                            <p className="text-2xl font-bold">
                                {unpaid.length > 0
                                    ? formatRWF(
                                        Math.round(
                                            totalOutstanding / unpaid.length,
                                        ),
                                    )
                                    : "RWF 0"}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Unpaid traders */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Outstanding Balances
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {unpaid.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            All traders are up to date with their VAT payments.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Business</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead className="text-right">
                                        VAT Due
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Outstanding
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {unpaid.map((t) => (
                                    <TableRow key={t.traderId}>
                                        <TableCell>
                                            <Link
                                                href={`/admin/traders/${t.traderId}`}
                                                className="text-sm font-medium hover:underline"
                                            >
                                                {t.traderName}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] capitalize"
                                            >
                                                {t.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatRWF(t.totalVatDue)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm font-medium text-red-600">
                                            {formatRWF(t.outstanding)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <SendReminderButton
                                                traderId={t.traderId}
                                                amount={t.outstanding}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
