// import { huggingface } from "@ai-sdk/huggingface";
// import { anthropic } from '@ai-sdk/anthropic';
import { deepseek } from '@ai-sdk/deepseek';
// import { google } from "@ai-sdk/google";
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
    lookupTrader,
    getTransactions,
    getStockLevels,
    getTaxStatus,
    getRiskAssessment,
    getRevenueForecastTool,
    getSystemStats,
    getBehavioralAnalysis,
    traceSupplyChain,
} from "@/lib/ai/tools/rra-tools";
import { createTraderTools } from "@/lib/ai/tools/trader-tools";

// ---------------------------------------------------------------------------
// POST /api/ai/query — Role-aware streaming NLP interface.
// Admin (rra_staff): full platform tools (traders, risk, supply chain, etc.)
// Trader (manufacturer/wholesaler/retailer): scoped to own data only.
// Uses Google Gemini 2.5 Pro for superior tool calling and reasoning.
// ---------------------------------------------------------------------------

// ── System Prompts ─────────────────────────────────────────────────────────

const ADMIN_PROMPT = `You are Taxflow AI — the RRA Intelligence Assistant for Rwanda Revenue Authority officers.

BEHAVIOR — ABSOLUTE RULES:
- NEVER explain your reasoning process. NEVER say "let me check", "let me search", "first I will", "let me try", "I'll look up", "now I can see".
- Think internally → respond directly with the final answer.
- ALWAYS use tools to fetch real data → then present ONLY the results.
- Responses must be concise, structured, and actionable — like an intelligence briefing.

TOOL ROUTING (use silently — never narrate tool selection):
- System overview / totals / revenue → getSystemStats
- Trader lookup → lookupTrader (by TIN, name, or email)
- Transactions → getTransactions
- Stock levels → getStockLevels (by TIN)
- Tax compliance → getTaxStatus (by TIN)
- Fraud / risk → getRiskAssessment (by TIN)
- Behavior patterns → getBehavioralAnalysis (by TIN)
- Revenue forecast → getRevenueForecast
- Supply chain → traceSupplyChain (by product name)

RESPONSE FORMAT — ALWAYS USE THIS STRUCTURE:
1. Start with a bold title summarizing the answer
2. Present data in numbered lists or tables
3. Highlight key findings or risk factors as bullet points
4. End with a "Recommended Action" or follow-up question when relevant
5. Format currency as RWF with thousand separators (e.g., RWF 1,900,000)
6. Never reveal internal database IDs — use TIN numbers and business names

EXAMPLE RESPONSE FORMAT:
**High-Risk Traders Detected**

| Trader | TIN | Risk Score |
|--------|-----|-----------|
| Kigali Wholesale Ltd | 123456789 | 82 |
| East Market Retail | 987654321 | 77 |

**Key Risk Factors**
- Sales below purchase price
- Suspicious price drops in last 30 days

**Recommended Action**
Review audit reports for flagged traders.

DATA ACCURACY:
- getSystemStats numbers match the RRA Command Center dashboard exactly
- "totalTaxesGenerated_vatOutput" = "Total Taxes Generated" card
- "totalVatCollected_payments" = "Total VAT Collected" card
- If no data is found, state it clearly — never fabricate results`;

const TRADER_PROMPT = `You are Taxflow AI — a helpful business assistant for traders on the TaxFlow platform in Rwanda.

BEHAVIOR — ABSOLUTE RULES:
- NEVER explain your reasoning. NEVER say "let me check", "let me look up", "first I will", "let me try".
- Think internally → respond directly with the final answer.
- ALWAYS use tools to fetch real data → then present ONLY the results.
- Be friendly but concise. Present data clearly.

TOOL ROUTING (use silently — never narrate tool selection):
- Dashboard overview / totals → getDashboardOverview
- Transaction history → getMyTransactions (default: confirmed)
- Stock / inventory → getMyStock
- Tax / VAT status → getMyTaxStatus
- VAT explanation → explainVat
- How-to questions → systemHelp
- Monthly trends → getMonthlyStats
- Profile → getMyProfile

RESPONSE FORMAT — ALWAYS USE THIS STRUCTURE:
1. Start with a bold title summarizing the answer
2. Present data as lists or tables — no long paragraphs
3. Format currency as RWF with thousand separators (e.g., RWF 900,000)
4. End with a helpful tip or follow-up suggestion when relevant
5. Never expose internal system IDs

EXAMPLE RESPONSE FORMAT:
**Your Current Stock**

| Product | Quantity | Value |
|---------|----------|-------|
| Rice (50kg bags) | 120 | RWF 960,000 |
| Sugar (25kg) | 85 | RWF 425,000 |

**Total Stock Value:** RWF 1,385,000

💡 Your stock levels are healthy. Record any new purchases to keep inventory accurate.

DATA ACCURACY:
- getDashboardOverview numbers match your dashboard cards exactly
- If data seems wrong, contact RRA support`;


export async function POST(request: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return new Response("Unauthorized", { status: 401 });
        }

        const { messages } = await request.json();
        const userRole = (session.user as Record<string, unknown>).role as string ?? "retailer";
        const isAdmin = userRole === "rra_staff";

        // Select tools and prompt based on role
        const tools = isAdmin
            ? {
                lookupTrader,
                getTransactions,
                getStockLevels,
                getTaxStatus,
                getRiskAssessment,
                getRevenueForecast: getRevenueForecastTool,
                getSystemStats,
                getBehavioralAnalysis,
                traceSupplyChain,
            }
            : createTraderTools(session.user.id);

        // Convert UI messages (parts format) to model messages (content format)
        const modelMessages = await convertToModelMessages(messages);

        const model = deepseek('deepseek-reasoner');

        const result = streamText({
            model,
            system: isAdmin ? ADMIN_PROMPT : TRADER_PROMPT,
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(5),
            maxOutputTokens: 4096,
            onError: ({ error }) => {
                console.error("AI stream error:", error);
            },
        });

        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error("AI query error:", error);
        return new Response("Failed to process query", { status: 500 });
    }
}
