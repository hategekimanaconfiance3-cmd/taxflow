"use client";

import { Button } from "@/components/ui/button";
import { FileText, CreditCard, AlertTriangle, RefreshCw } from "lucide-react";

export function ActionBar() {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:pl-64">
            <div className="flex items-center justify-center gap-3 p-3">
                <Button variant="outline" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Export Report (PDF)
                </Button>
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <CreditCard className="h-4 w-4" />
                    Tax Payment
                </Button>
                <Button
                    variant="outline"
                    className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                    <AlertTriangle className="h-4 w-4" />
                    Compliance Alert
                </Button>
                <Button variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    RRA Sync
                </Button>
            </div>
        </div>
    );
}
