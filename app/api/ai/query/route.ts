// ---------------------------------------------------------------------------
// POST /api/ai/query — TaxFlow AI Assistant endpoint
//
// Security model:
// • Session is validated server-side on every request. No user-supplied role or
//   businessId is trusted — they are always read from the server-side session.
// • Trader users: can only query their own data (userId is injected from session).
// • RRA staff: can query any trader by TIN via RRA tools.
// • All AI queries are audit-logged.
// • The LLM is never given raw PII beyond what the tool results return, and
//   tools are scoped strictly to what the role can see.
// ---------------------------------------------------------------------------

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { stepCountIs, streamText, type ToolSet } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/db/drizzle";
import { rraStaff, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { consumeRateLimit, getRequestIdentity } from "@/lib/rate-limit";
import { createTraderTools } from "@/lib/ai/tools/trader-tools";
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
    traceProductJourney,
    getImportDeclarations,
} from "@/lib/ai/tools/rra-tools";
import { hasRRAPermission, isRRARole, type RRARole } from "@/lib/rra-rbac";

// ---------------------------------------------------------------------------
// Model setup — Google Gemini Flash (fast, cost-effective, 1M context)
// ---------------------------------------------------------------------------

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
});

const MODEL = google("gemini-2.0-flash");

const requestSchema = z.object({
    messages: z.array(z.unknown()).min(1).max(20),
}).strict();

const messageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.unknown()).max(40),
}).passthrough();

const textPartSchema = z.object({ type: z.literal("text"), text: z.string().max(4_000) }).passthrough();

function parseMessages(input: unknown): { role: "user" | "assistant"; content: string }[] | null {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return null;

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    let totalCharacters = 0;
    for (const candidate of parsed.data.messages) {
        const message = messageSchema.safeParse(candidate);
        if (!message.success) return null;

        // Only forward plain text. Client-supplied tool calls/results, files, and
        // metadata are deliberately excluded from the model context.
        const content = message.data.parts
            .map((part) => textPartSchema.safeParse(part))
            .filter((part) => part.success)
            .map((part) => part.data.text)
            .join("\n")
            .trim();
        totalCharacters += content.length;
        if (totalCharacters > 12_000) return null;
        if (content) messages.push({ role: message.data.role, content });
    }

    if (messages.length === 0 || messages.at(-1)?.role !== "user") return null;
    return messages;
}

// ---------------------------------------------------------------------------
// System prompts — role-specific
// ---------------------------------------------------------------------------

const TRADER_SYSTEM_PROMPT = `You are TaxFlow AI, a trusted business assistant for registered traders in Rwanda.
You help manufacturers, wholesalers, and retailers understand their own business data.

CRITICAL RULES:
1. You ONLY have access to the logged-in user's own data. You CANNOT access other traders' data.
2. Always use the available tools to retrieve real data from the database before answering any question about figures.
3. NEVER invent, estimate, or fabricate numbers. If data is unavailable, say so clearly.
4. If a tool returns no data or an error, tell the user honestly — do not make up values.
5. For tax law questions (VAT rates, filing deadlines), use the explainVat tool and clearly state these are Rwanda RRA rules.
6. You are READ-ONLY. You cannot record sales, change stock, make payments, or modify any records.
7. All amounts are in Rwandan Francs (RWF). Never convert to other currencies unless explicitly asked.
8. Be concise, accurate, and professional. Use tables when presenting multiple data points.
9. If the user asks about another business, politely explain you can only show their own data.

Format numbers with commas (e.g. 1,234,567 RWF).
Today's date: ${new Date().toLocaleDateString("en-RW", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

const RRA_SYSTEM_PROMPT = `You are TaxFlow Intelligence, an AI assistant for Rwanda Revenue Authority (RRA) officers.
You help compliance officers, audit officers, and other RRA staff investigate trader data, assess risk, and monitor national tax compliance.

CRITICAL RULES:
1. Always use the available tools to retrieve real, verified data before making any claims.
2. NEVER invent figures, risk scores, or compliance assessments. If data is not available, say so.
3. You are READ-ONLY. You cannot impose penalties, freeze accounts, change records, or take enforcement actions.
4. When you retrieve risk scores or behavioral analysis, clearly label them as AI-generated estimates — not official determinations.
5. Taxpayer information is confidential. Only share it in the context of official RRA work.
6. Always distinguish between: (a) verified database facts, (b) AI-computed indicators, and (c) general explanations.
7. If asked to take an action (send notice, impose penalty), explain you are read-only and direct the officer to the appropriate module.
8. All amounts are in Rwandan Francs (RWF).
9. Be precise, professional, and concise. Use tables for comparative data.
10. For product traceability questions, use traceProductJourney when available. Report only its transaction records and clearly separate origin declarations that have no recorded batch link. Never infer quantity discrepancies or fraud from missing links.

Format numbers with commas (e.g. 1,234,567 RWF).
Today's date: ${new Date().toLocaleDateString("en-RW", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
    // ── 1. Authenticate ─────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;
    try {
        const limit = await consumeRateLimit(
            "ai-query",
            `${userId}:${getRequestIdentity(request.headers)}`,
            20,
            60,
        );
        if (!limit.allowed) {
            console.warn("AI query rate limit exceeded", { userId });
            return new Response(
                JSON.stringify({ error: "Too many AI requests. Please try again shortly." }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": String(limit.retryAfterSeconds),
                    },
                },
            );
        }
    } catch (error) {
        console.error("AI query rate limit unavailable", error);
        return new Response(
            JSON.stringify({ error: "The AI service is temporarily unavailable." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
        );
    }

    const userRole = session.user.role as string;

    // ── 2. Determine role context ─────────────────────────────────────────────
    const TRADER_ROLES = ["manufacturer", "wholesaler", "retailer"];
    const isTrader = TRADER_ROLES.includes(userRole);

    // Check RRA staff status (verify against DB, not client-supplied data)
    let isRRAStaff = false;
    let staffClearance = "";

    if (!isTrader) {
        const staffRecords = await db
            .select({ clearanceLevel: rraStaff.clearanceLevel, isActive: rraStaff.isActive })
            .from(rraStaff)
            .where(eq(rraStaff.userId, userId))
            .limit(1);

        if (staffRecords.length > 0 && staffRecords[0].isActive) {
            isRRAStaff = true;
            staffClearance = staffRecords[0].clearanceLevel;
        }
    }

    // Must be either a trader or active RRA staff
    if (!isTrader && !isRRAStaff) {
        return new Response("Forbidden", { status: 403 });
    }
    if (session.user.isActive === false) {
        return new Response("Forbidden", { status: 403 });
    }
    if (!isTrader && (!isRRARole(staffClearance) || !hasRRAPermission(staffClearance, "ai.assistant.use"))) {
        return new Response("Forbidden", { status: 403 });
    }

    // ── 3. Parse request body ────────────────────────────────────────────────
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const messages = parseMessages(body);
    if (!messages) {
        return Response.json({ error: "Invalid chat request. Please shorten your message and try again." }, { status: 400 });
    }

    // Extract the latest user message for audit logging
    const lastUserMsg = [...messages]
        .reverse()
        .find((m) => m.role === "user");
    const questionText = lastUserMsg?.content ?? "";

    // ── 4. Prompt injection guard ────────────────────────────────────────────
    // Reject messages that attempt to override system prompt or exfiltrate data
    const INJECTION_PATTERNS = [
        /ignore.{0,30}(previous|above|all).{0,30}instruction/i,
        /you are now/i,
        /system prompt/i,
        /jailbreak/i,
        /act as.{0,20}(DAN|unrestricted|unfiltered)/i,
        /reveal.{0,30}(api key|secret|password|env)/i,
        /repeat.{0,30}everything.{0,30}said/i,
    ];

    for (const message of messages) {
        if (message.role === "user" && INJECTION_PATTERNS.some((pattern) => pattern.test(message.content))) {
            return new Response(
                JSON.stringify({
                    error: "Message blocked: potential prompt injection detected.",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }
    }

    // ── 5. Audit log the query ───────────────────────────────────────────────
    try {
        await db.insert(auditLog).values({
            userId,
            action: "AI_QUERY",
            targetType: "ai_assistant",
            targetId: null,
            metadata: JSON.stringify({
                role: isTrader ? userRole : `rra_staff:${staffClearance}`,
                questionHash: createHash("sha256").update(questionText).digest("hex"),
                questionLength: questionText.length,
            }),
        });
    } catch (error) {
        console.error("AI query audit logging failed", error);
        return new Response(
            JSON.stringify({ error: "The AI service is temporarily unavailable." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
        );
    }

    // ── 6. Build tools for this role ──────────────────────────────────────────
    const rraToolSets: Partial<Record<RRARole, ToolSet>> = {
        super_admin: {},
        director_executive: { getSystemStats, getRevenueForecastTool },
        tax_compliance_officer: { lookupTrader, getTransactions, getTaxStatus },
        audit_investigation_officer: {
            lookupTrader, getTransactions, getStockLevels, getTaxStatus, getRiskAssessment,
            getRevenueForecastTool, getSystemStats, getBehavioralAnalysis, traceProductJourney,
            getImportDeclarations,
        },
        product_traceability_officer: { getTransactions, getStockLevels, traceProductJourney },
        customs_import_officer: { getImportDeclarations },
        payments_reconciliation_officer: { getTransactions, getTaxStatus },
        data_ai_analyst: { getSystemStats, getRevenueForecastTool, getBehavioralAnalysis, getRiskAssessment },
        compliance_officer: { lookupTrader, getTransactions, getTaxStatus, getRiskAssessment, traceSupplyChain },
        audit_officer: {
            lookupTrader, getTransactions, getStockLevels, getTaxStatus, getRiskAssessment,
            getRevenueForecastTool, getSystemStats, getBehavioralAnalysis, traceSupplyChain,
            traceProductJourney, getImportDeclarations,
        },
        stock_officer: { lookupTrader, getTransactions, getStockLevels, traceProductJourney },
        correction_officer: { lookupTrader, getTransactions, getStockLevels },
        reporting_officer: { getSystemStats, getRevenueForecastTool },
    };
    const tools: ToolSet = isTrader
        ? createTraderTools(userId)
        : isRRARole(staffClearance)
            ? rraToolSets[staffClearance] ?? {}
            : {};

    // ── 7. Stream the response ───────────────────────────────────────────────
    try {
        const result = streamText({
            model: MODEL,
            system: isTrader ? TRADER_SYSTEM_PROMPT : RRA_SYSTEM_PROMPT,
            messages,
            tools,
            stopWhen: stepCountIs(5),
            temperature: 0.1,      // low temperature for factual accuracy
            maxOutputTokens: 2048,
            abortSignal: AbortSignal.timeout(30_000),
            onError: () => console.error("AI query provider stream failed", { userId }),
        });

        return result.toUIMessageStreamResponse();
    } catch (err) {
        console.error("[AI Query] streamText error:", err);

        // Surface model outage gracefully — never expose internal error details
        return new Response(
            JSON.stringify({
                error: "The AI service is temporarily unavailable. Please try again in a moment.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
        );
    }
}
