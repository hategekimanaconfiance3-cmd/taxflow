import { requireRRASession } from "@/lib/auth-guard";
import { getBulletins } from "@/lib/actions/admin-bulletin.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, AlertTriangle, Info, AlertCircle } from "lucide-react";

const PRIORITY_CONFIG = {
    info: { label: "Info", icon: Info, variant: "outline" as const, color: "text-blue-500" },
    important: { label: "Important", icon: AlertCircle, variant: "secondary" as const, color: "text-amber-500" },
    urgent: { label: "Urgent", icon: AlertTriangle, variant: "destructive" as const, color: "text-red-500" },
};

export default async function BulletinBoardPage() {
    await requireRRASession();
    const bulletins = await getBulletins();

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Staff Bulletin Board
                    </h1>
                    <p className="text-muted-foreground">
                        Internal announcements for RRA staff.
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Megaphone className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Total Bulletins</p>
                            <p className="text-2xl font-bold">{bulletins.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Urgent</p>
                            <p className="text-2xl font-bold">
                                {bulletins.filter((b) => b.priority === "urgent").length}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertCircle className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Important</p>
                            <p className="text-2xl font-bold">
                                {bulletins.filter((b) => b.priority === "important").length}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Bulletins List */}
            {bulletins.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-sm text-muted-foreground">
                            No bulletins posted yet.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {bulletins.map((b) => {
                        const cfg = PRIORITY_CONFIG[b.priority] ?? PRIORITY_CONFIG.info;
                        const Icon = cfg.icon;
                        return (
                            <Card key={b.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <Icon className={`h-5 w-5 ${cfg.color}`} />
                                            <CardTitle className="text-base font-semibold">
                                                {b.title}
                                            </CardTitle>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={cfg.variant} className="text-[10px]">
                                                {cfg.label}
                                            </Badge>
                                            {b.department && (
                                                <Badge variant="outline" className="text-[10px]">
                                                    {b.department}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm whitespace-pre-wrap">{b.content}</p>
                                    <p className="text-xs text-muted-foreground mt-3">
                                        Posted by {b.authorName} · {new Date(b.createdAt).toLocaleString()}
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
