import { requireRRASession } from '@/lib/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Cpu, Sparkles } from 'lucide-react';

export default async function AiComputePage() {
  await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Compute</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered batch processing and intelligence tools for the RRA.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-violet-500" />
              AI Risk Scoring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Batch-compute AI risk scores for all registered traders using transaction patterns, VAT compliance, and pricing data.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Price Floor Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              AI-computed price floors and ceilings by product and district to detect underreporting and price manipulation.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-500" />
              Anomaly Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Automated detection of high-quantity sales, duplicate transactions, negative stock, and suspicious pricing anomalies.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
          <Bot className="h-10 w-10 text-violet-400" />
          <p className="font-semibold text-base">AI Batch Processing Tools</p>
          <p className="text-sm text-muted-foreground max-w-md">
            AI batch processing is available via the <span className="font-medium text-violet-600">AI chat widget</span> in the bottom-right corner.
            Use natural language to run risk analyses, generate reports, and query trader data.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Try: &quot;Run risk scores for all manufacturers&quot; or &quot;Show anomalies from last 30 days&quot;
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
