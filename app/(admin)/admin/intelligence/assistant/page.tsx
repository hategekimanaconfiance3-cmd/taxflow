import { requireRRAPermission } from '@/lib/auth-guard';
import { IntelligenceChat } from '@/components/admin/intelligence-chat';
import { getRRAAIToolNames } from '@/lib/ai/rra-tool-access';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Shield, AlertCircle } from 'lucide-react';

export const metadata = {
  title: 'Intelligence Assistant · RRA TaxFlow',
  description: 'AI-powered tax intelligence for RRA officers.',
};

export default async function AdminAssistantPage() {
  const { staff } = await requireRRAPermission("ai.assistant.use");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-violet-500" />
            Intelligence Assistant
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ask about traders, transactions, risk scores, revenue, and compliance in natural language.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">
            <Shield className="h-3 w-3 mr-1" />
            Read-only · Human review required
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {staff.clearanceRoles.map((role) => role.replaceAll('_', ' ')).join(', ')}
          </Badge>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>
          This assistant retrieves <strong>verified data</strong> from the TaxFlow database.
          AI-generated risk scores and behavioral analysis are <strong>indicators only</strong> —
          not official determinations. Queries and accessed modules are audit-logged. The assistant can analyze and recommend next steps, but it is read-only and cannot execute actions or decide clearance, tax liability, payments, disputes, penalties, or enforcement. An authorized human employee makes every official decision.
        </p>
      </div>

      {/* Chat */}
      <Card className="h-[calc(100vh-280px)] flex flex-col overflow-hidden">
        <CardHeader className="pb-0 shrink-0 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2 pb-3">
            <Brain className="h-4 w-4 text-violet-500" />
            TaxFlow Intelligence · Powered by Gemini
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
            <IntelligenceChat authorizedTools={getRRAAIToolNames(staff.clearanceRoles)} />
        </CardContent>
      </Card>
    </div>
  );
}

