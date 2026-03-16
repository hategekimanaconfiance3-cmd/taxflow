import { requireRRASession } from "@/lib/auth-guard";
import { getAllTickets, getTicketStats } from "@/lib/actions/admin-support-ticket.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Inbox, Clock, CheckCircle, Loader2 } from "lucide-react";

const STATUS_VARIANT = {
    open: "destructive" as const,
    in_progress: "secondary" as const,
    resolved: "default" as const,
    closed: "outline" as const,
};

export default async function AdminSupportPage() {
    await requireRRASession();
    const [tickets, stats] = await Promise.all([
        getAllTickets(),
        getTicketStats(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Support Tickets
                </h1>
                <p className="text-muted-foreground">
                    Manage taxpayer service requests.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Inbox className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Open</p>
                            <p className="text-2xl font-bold">{stats.open}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Loader2 className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">In Progress</p>
                            <p className="text-2xl font-bold">{stats.inProgress}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle className="h-8 w-8 text-green-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Resolved</p>
                            <p className="text-2xl font-bold">{stats.resolved}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Clock className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Total</p>
                            <p className="text-2xl font-bold">{stats.total}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tickets Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        All Tickets
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {tickets.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No support tickets yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Trader</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Priority</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tickets.map((t) => (
                                    <TableRow key={t.id}>
                                        <TableCell className="font-medium">
                                            {t.subject}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {t.traderName ?? "Unknown"}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[10px] capitalize">
                                                {t.category.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={STATUS_VARIANT[t.status as keyof typeof STATUS_VARIANT] ?? "outline"}
                                                className="text-[10px] capitalize"
                                            >
                                                {t.status.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={t.priority === "high" ? "destructive" : "outline"}
                                                className="text-[10px] capitalize"
                                            >
                                                {t.priority}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(t.createdAt).toLocaleDateString()}
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
