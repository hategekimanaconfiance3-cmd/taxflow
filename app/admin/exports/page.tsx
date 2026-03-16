import { requireRRASession } from "@/lib/auth-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Database, FileSpreadsheet } from "lucide-react";
import {
    ExportNationalData,
    ExportTaxpayerDirectory,
    ExportComplianceDataset,
} from "@/components/admin/bulk-export-buttons";

export default async function ExportsPage() {
    await requireRRASession("reporting_officer");

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Data Exports
                </h1>
                <p className="text-muted-foreground">
                    Download comprehensive datasets for reporting and analysis.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Available Exports
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ExportNationalData />
                    <ExportTaxpayerDirectory />
                    <ExportComplianceDataset />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground space-y-2">
                        <p className="font-medium text-foreground">
                            Export Information
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-xs">
                            <li>
                                Files are generated in CSV format, compatible
                                with Excel, Google Sheets, and data analysis
                                tools.
                            </li>
                            <li>
                                National Tax Data includes all trader details,
                                VAT positions, payment history, and compliance
                                metrics.
                            </li>
                            <li>
                                Compliance Dataset includes risk levels
                                (low/medium/high/critical) for policy analysis.
                            </li>
                            <li>
                                All exports are timestamped and logged in the
                                audit trail.
                            </li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
