import { requireRRASession } from "@/lib/auth-guard";
import { getAuditLogs } from "@/lib/actions/admin.action";
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
import { ScrollText } from "lucide-react";
import { ExportAuditCSV } from "@/components/admin/admin-export";

export default async function AuditPage() {
    await requireRRASession("audit_officer");
    const logs = await getAuditLogs({ limit: 100 });

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Audit Logs
                    </h1>
                    <p className="text-muted-foreground">
                        Complete system activity trail.
                    </p>
                </div>
                {logs.length > 0 && <ExportAuditCSV rows={logs} />}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ScrollText className="h-4 w-4" />
                        Activity Log
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {logs.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No audit events recorded yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Timestamp</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {new Date(
                                                log.createdAt,
                                            ).toLocaleString("en-RW", {
                                                dateStyle: "short",
                                                timeStyle: "short",
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-sm">
                                                    {log.userName}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {log.businessName ?? "—"}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className="text-xs font-mono"
                                            >
                                                {log.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {log.targetType && (
                                                <span className="capitalize">
                                                    {log.targetType}
                                                </span>
                                            )}
                                            {log.targetId && (
                                                <span className="font-mono text-xs ml-1">
                                                    #{log.targetId.slice(0, 8)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                            {log.metadata ?? "—"}
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
