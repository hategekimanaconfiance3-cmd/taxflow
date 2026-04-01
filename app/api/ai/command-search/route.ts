import { deepseek } from "@ai-sdk/deepseek";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
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
// POST /api/ai/command-search — Quick AI search for the command palette.
// Returns a concise answer + optional navigation links.
// Role-scoped: RRA staff get full platform tools, traders get own-data tools.
// ---------------------------------------------------------------------------

const ADMIN_ROUTES = `
NAVIGATABLE SYSTEM PAGES (for suggestLinks):
/admin/dashboard — Command Center
/admin/traders — Traders list
/admin/transactions — Transactions
/admin/imports — Import Declarations
/admin/supply-chain — Supply Chain
/admin/stock — Stock Overview
/admin/intelligence/unregistered — Taxpayer Discovery
/admin/tax — VAT & Tax
/admin/payments — Payments
/admin/reports — Tax Reports
/admin/reports/arrears-aging — Arrears Aging
/admin/reports/kpi-targets — KPI Targets
/admin/reports/data-quality — Data Quality
/admin/reports/summary — Summary Report
/admin/disputes — Disputes
/admin/anomalies — Anomaly Detection
/admin/vat-verification — VAT Verification
/admin/compliance — Compliance
/admin/compliance-alerts — Compliance Alerts
/admin/audit — Audit Trail
/admin/exports — Data Exports
/admin/notifications — Notifications
/admin/settings — Settings`;

const TRADER_ROUTES = `
NAVIGATABLE SYSTEM PAGES (for suggestLinks):
/dashboard — Main Dashboard
/dashboard/sell — Sell to Buyer
/dashboard/sales — Sales History
/dashboard/inventory — Inventory
/dashboard/payments — Payments & VAT
/dashboard/disputes — Disputes
/dashboard/tax — Tax Report
/dashboard/production — Production
/dashboard/profile — Business Profile
/dashboard/notifications — Notifications`;

const ADMIN_PROMPT = `You are Taxflow AI — concise RRA Intelligence Assistant for the command palette.
Answer in 1–4 sentences or a short table/list. No lengthy explanations.
Use data tools to fetch real data before answering.
Format currency as RWF with commas (e.g., RWF 1,200,000).
Never expose internal database IDs — use TIN numbers and business names only.
Call suggestLinks with 1–3 relevant pages when your answer relates to a specific system section.
${ADMIN_ROUTES}`;

const TRADER_PROMPT = `You are Taxflow AI — concise trader assistant for the command palette.
Answer in 1–4 sentences or a short list. No lengthy explanations.
Use data tools to fetch real data before answering.
Format currency as RWF with commas (e.g., RWF 900,000).
Call suggestLinks with 1–2 relevant pages when your answer relates to a specific system section.
${TRADER_ROUTES}`;

/** Lets the AI register navigation links relevant to its answer. */
const suggestLinks = tool({
    description: "Suggest 1–3 navigation links that are relevant to the answer. Call this when your answer relates to a specific system section the user could navigate to.",
    inputSchema: z.object({
        links: z
            .array(
                z.object({
                    label: z.string().describe("Short action label, e.g. 'View Traders', 'Go to Payments'"),
                    href: z.string().describe("URL path from the navigatable pages list"),
                }),
            )
            .max(3),
    }),
    execute: async ({ links }) => links,
});

export async function POST(request: Request): Promise<Response> {
    try {
        const session = await auth.api.getSession({ headers: await headers() });

        if (!session?.user?.id) {
            return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const query = typeof body?.query === "string" ? body.query.trim() : "";

        if (!query) {
            return new Response("Bad Request", { status: 400 });
        }

        const userRole = (session.user as Record<string, unknown>).role as string ?? "retailer";
        const isAdmin = userRole === "rra_staff";

        const dataTools = isAdmin
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

        const { text, steps } = await generateText({
            model: deepseek("deepseek-chat"),
            system: isAdmin ? ADMIN_PROMPT : TRADER_PROMPT,
            prompt: query,
            tools: { ...dataTools, suggestLinks },
            stopWhen: stepCountIs(4),
            maxOutputTokens: 512,
        });

        // Extract any navigation links the AI suggested
        const links: Array<{ label: string; href: string }> = [];
        for (const step of steps) {
            for (const toolResult of step.toolResults) {
                if (toolResult.toolName === "suggestLinks" && Array.isArray(toolResult.output)) {
                    links.push(...(toolResult.output as Array<{ label: string; href: string }>));
                }
            }
        }

        return Response.json({ answer: text, links });
    } catch (error) {
        console.error("Command search error:", error);
        return new Response("Search failed", { status: 500 });
    }
}
