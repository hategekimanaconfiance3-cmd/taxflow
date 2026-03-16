import { requireTraderSession } from "@/lib/auth-guard";
import { getMyTickets } from "@/lib/actions/support-ticket.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, CheckCircle } from "lucide-react";

const STATUS_VARIANT = {
    open: "destructive" as const,
    in_progress: "secondary" as const,
    resolved: "default" as const,
    closed: "outline" as const,
};

export default async function SupportPage() {
    await requireTraderSession();
    const tickets = await getMyTickets();

    const openCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
    const resolvedCount = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Support Center
                </h1>
                <p className="text-muted-foreground">
                    Submit and track service requests.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Ticket className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Total Tickets</p>
                            <p className="text-2xl font-bold">{tickets.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Clock className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Open</p>
                            <p className="text-2xl font-bold">{openCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle className="h-8 w-8 text-green-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Resolved</p>
                            <p className="text-2xl font-bold">{resolvedCount}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tickets Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">My Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                    {tickets.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            You haven&apos;t submitted any tickets yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Resolution</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tickets.map((t) => (
                                    <TableRow key={t.id}>
                                        <TableCell className="font-medium">{t.subject}</TableCell>
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
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(t.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-sm max-w-[200px] truncate">
                                            {t.resolution ?? "—"}
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
