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
import { convertToModelMessages, stepCountIs, streamText, validateUIMessages, type ToolSet } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/db/drizzle";
import { rraStaff, rraStaffRole, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { consumeRateLimit, getRequestIdentity } from "@/lib/rate-limit";
import { createTraderTools } from "@/lib/ai/tools/trader-tools";
import {
    getTaxpayerIntelligence,
    lookupTrader,
    searchTraders,
    getTransactions,
    getStockLevels,
    getStockMovements,
    getTaxStatus,
    getRiskAssessment,
    getRevenueForecastTool,
    getSystemStats,
    getBehavioralAnalysis,
    traceSupplyChain,
    traceProductJourney,
    getImportDeclarations,
} from "@/lib/ai/tools/rra-tools";
import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";
import { getRRAAIToolNames, isRRAAIInjectionAttempt, type RRAAIToolName } from "@/lib/ai/rra-tool-access";
import { getRRASystemPrompt, getTraderSystemPrompt } from "@/lib/ai/system-prompts";

// ---------------------------------------------------------------------------
// Model setup — Gemini 3.6 Flash is the current supported Flash model.
// ---------------------------------------------------------------------------

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
const google = createGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY ?? "",
});

const MODEL = google(process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || "gemini-3.6-flash");

const requestSchema = z.object({
    // A long-running chat can exceed the context window we send to the model;
    // parse the newest messages below instead of rejecting the whole request.
    messages: z.array(z.unknown()).min(1).max(100),
    // DefaultChatTransport and future SDK versions can add request metadata.
    // It is ignored; identity, role, and tool access always come from the session.
    id: z.string().max(128).optional(),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
    messageId: z.string().max(128).optional(),
}).passthrough();

const messageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    id: z.string().max(128).optional(),
    parts: z.array(z.unknown()).max(100),
}).passthrough();

const textPartSchema = z.object({ type: z.literal("text"), text: z.string().max(12_000) }).passthrough();
const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONTEXT_CHARACTERS = 12_000;

function parseMessages(input: unknown): { rawMessages: Record<string, unknown>[]; textMessages: { role: "user" | "assistant"; content: string }[] } | null {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return null;

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    for (const candidate of parsed.data.messages) {
        const message = messageSchema.safeParse(candidate);
        if (!message.success) return null;

        const textParts = message.data.parts.flatMap((part) => {
            const textPart = textPartSchema.safeParse(part);
            // Only send visible text back to the model. Tool invocations and
            // tool results are client-controlled historical payloads; omitting
            // them avoids trusting forged results and accepts SDK step markers.
            return textPart.success ? [textPart.data.text] : [];
        });
        const content = textParts.join("\n").trim();
        if (content) {
            const previousMessage = messages.at(-1);
            if (previousMessage?.role === message.data.role) {
                previousMessage.content = `${previousMessage.content}\n${content}`;
            } else {
                messages.push({ role: message.data.role, content });
            }
        }
    }

    const lastMessage = messageSchema.safeParse(parsed.data.messages.at(-1));
    // Each request must end with a new user instruction. In particular, never
    // accept a client-submitted tool approval as authorization to execute a
    // consequential action. The assistant has read-only tools only.
    if (!lastMessage.success || lastMessage.data.role !== "user" || messages.at(-1)?.role !== "user") return null;

    // Keep a bounded, recent text-only history. This lets old chats continue
    // without rejecting a short new question once they exceed the model window.
    const context: typeof messages = [];
    let contextCharacters = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (context.length >= MAX_CONTEXT_MESSAGES || contextCharacters + message.content.length > MAX_CONTEXT_CHARACTERS) break;
        context.unshift(message);
        contextCharacters += message.content.length;
    }
    if (context.at(-1)?.role !== "user") return null;

    const rawMessages = context.map((message, index) => ({
        id: `ai-context-${index}`,
        role: message.role,
        parts: [{ type: "text", text: message.content }],
    }));
    return { rawMessages, textMessages: context };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
    // ── 1. Authenticate ─────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
    }
    if (session.user.isActive === false) {
        return new Response("Forbidden", { status: 403 });
    }

    const userId = session.user.id;
    if (!GOOGLE_API_KEY) {
        console.error("AI query is unavailable because GOOGLE_GENERATIVE_AI_API_KEY is not configured.");
        return Response.json(
            { error: "The AI assistant is not configured. Please contact your administrator." },
            { status: 503 },
        );
    }

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
    let staffRoles: string[] = [];
    let staffDepartment: string | null = null;

    if (!isTrader) {
        const staffRecords = await db
            .select({ id: rraStaff.id, clearanceLevel: rraStaff.clearanceLevel, isActive: rraStaff.isActive, department: rraStaff.department })
            .from(rraStaff)
            .where(eq(rraStaff.userId, userId))
            .limit(1);

        if (staffRecords.length > 0 && staffRecords[0].isActive) {
            isRRAStaff = true;
            staffClearance = staffRecords[0].clearanceLevel;
            staffDepartment = staffRecords[0].department;
            const assignments = await db.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, staffRecords[0].id));
            staffRoles = assignments.length ? assignments.map(({ role }) => role) : [staffClearance];
        }
    }

    // Must be either a trader or active RRA staff
    if (!isTrader && !isRRAStaff) {
        return new Response("Forbidden", { status: 403 });
    }
    if (!isTrader && !staffRoles.some((role) => isRRARole(role) && hasRRAPermission(role, "ai.assistant.use"))) {
        return new Response("Forbidden", { status: 403 });
    }

    // ── 3. Parse request body ────────────────────────────────────────────────
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const parsedMessages = parseMessages(body);
    if (!parsedMessages) {
        return Response.json({ error: "I couldn't read this chat message. Please resend your question, or clear the chat if the problem continues." }, { status: 400 });
    }

    // Extract the latest user message for audit logging
    const lastUserMsg = [...parsedMessages.textMessages]
        .reverse()
        .find((m) => m.role === "user");
    const questionText = lastUserMsg?.content ?? "";

    // ── 4. Prompt injection guard ────────────────────────────────────────────
    // Reject messages that attempt to override system prompt or exfiltrate data
    for (const message of parsedMessages.textMessages) {
        if (message.role === "user" && isRRAAIInjectionAttempt(message.content)) {
            return new Response(
                JSON.stringify({
                    error: "Message blocked: potential prompt injection detected.",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }
    }

    // ── 5. Resolve the data tools using the current RBAC permission catalogue ─
    const rraToolRegistry = {
        getTaxpayerIntelligence, lookupTrader, searchTraders, getTransactions, getStockLevels, getStockMovements, getTaxStatus,
        getRiskAssessment, getRevenueForecastTool, getSystemStats, getBehavioralAnalysis,
        traceSupplyChain, traceProductJourney, getImportDeclarations,
    } satisfies Record<RRAAIToolName, ToolSet[RRAAIToolName]>;
    const allowedRraTools = getRRAAIToolNames(staffRoles);
    const rraReadTools: ToolSet = isRRAStaff
        ? Object.fromEntries(allowedRraTools.map((name) => [name, rraToolRegistry[name]])) as ToolSet
        : {};
    // The assistant is intentionally read-only. Consequential operations must
    // be started in their dedicated authenticated human workflows, never by an
    // AI tool call or a client-supplied approval part.
    const tools: ToolSet = isTrader ? createTraderTools(userId) : rraReadTools;

    // ── 6. Audit the request without storing the question or its TIN ─────────
    let aiAuditId: string | null = null;
    try {
        const [audit] = await db.insert(auditLog).values({
            userId,
            action: "AI_QUERY",
            targetType: "ai_assistant",
            targetId: null,
            metadata: JSON.stringify({
                role: isTrader ? userRole : `rra_staff:${staffRoles.join(",")}`,
                department: isRRAStaff ? staffDepartment : undefined,
                questionHash: createHash("sha256").update(questionText).digest("hex"),
                questionLength: questionText.length,
                authorizedTools: isRRAStaff ? allowedRraTools : undefined,
                modulesAccessed: [],
                requestCategory: "pending_tool_selection",
                aiRecommendationGenerated: false,
            }),
        }).returning({ id: auditLog.id });
        aiAuditId = audit?.id ?? null;
        if (!aiAuditId) throw new Error("AI usage audit record was not created.");
    } catch (error) {
        console.error("AI query audit logging failed", error);
        return new Response(
            JSON.stringify({ error: "The AI service is temporarily unavailable." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
        );
    }

    // ── 7. Stream the response ───────────────────────────────────────────────
    try {
        const validatedMessages = await validateUIMessages({
            messages: parsedMessages.rawMessages,
            tools: tools as Parameters<typeof validateUIMessages>[0]["tools"],
        });
        const modelMessages = await convertToModelMessages(validatedMessages, {
            tools: tools as NonNullable<Parameters<typeof convertToModelMessages>[1]>["tools"],
        });
        const result = streamText({
            model: MODEL,
            system: isTrader ? getTraderSystemPrompt() : [
                getRRASystemPrompt(),
                "\nVERIFIED OFFICER CONTEXT (server supplied):",
                `Roles: ${staffRoles.join(", ") || staffClearance}.`,
                `Department: ${staffDepartment ?? "not recorded"}.`,
                `Authorized data tools: ${allowedRraTools.join(", ") || "none"}.`,
                "Adapt the focus of your answer to these roles and tools. Tool results are already filtered by server-side permissions. Never infer or describe data from a module whose tool is unavailable.",
                "When making a recommendation, include the exact label: AI Recommendation — Human Review Required.",
            ].join("\n"),
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(5),
            temperature: 0.1,      // low temperature for factual accuracy
            maxOutputTokens: 2048,
            abortSignal: AbortSignal.timeout(30_000),
            onFinish: async ({ text, steps }) => {
                if (!isRRAStaff || !aiAuditId) return;
                const usedTools = [...new Set(steps.flatMap((step) => step.toolResults.map((toolResult) => toolResult.toolName)))];
                const moduleByTool: Record<RRAAIToolName, string> = {
                    getTaxpayerIntelligence: "taxpayer_intelligence",
                    lookupTrader: "taxpayer_directory",
                    searchTraders: "taxpayer_directory",
                    getTransactions: "transactions",
                    getStockLevels: "inventory",
                    getStockMovements: "stock_movements",
                    getTaxStatus: "tax_compliance",
                    getRiskAssessment: "risk_assessment",
                    getRevenueForecastTool: "revenue_analytics",
                    getSystemStats: "aggregate_statistics",
                    getBehavioralAnalysis: "behavioral_analysis",
                    traceSupplyChain: "supply_chain",
                    traceProductJourney: "product_journey",
                    getImportDeclarations: "imports",
                };
                const modulesAccessed = [...new Set(usedTools
                    .filter((toolName): toolName is RRAAIToolName => toolName in moduleByTool)
                    .map((toolName) => moduleByTool[toolName]))];
                const requestCategory = modulesAccessed.length > 1
                    ? "cross_module"
                    : modulesAccessed[0] ?? "general_guidance";
                try {
                    await db.update(auditLog).set({ metadata: JSON.stringify({
                        role: `rra_staff:${staffRoles.join(",")}`,
                        department: staffDepartment,
                        questionHash: createHash("sha256").update(questionText).digest("hex"),
                        questionLength: questionText.length,
                        authorizedTools: allowedRraTools,
                        modulesAccessed,
                        requestCategory,
                        aiRecommendationGenerated: /AI Recommendation\s*[—-]\s*Human Review Required/i.test(text),
                    }) }).where(eq(auditLog.id, aiAuditId));
                } catch (error) {
                    console.error("AI usage audit completion failed", {
                        userId,
                        auditId: aiAuditId,
                        errorName: error instanceof Error ? error.name : typeof error,
                    });
                }
            },
            onError: ({ error }) => console.error("AI query provider stream failed", {
                userId,
                errorName: error instanceof Error ? error.name : typeof error,
            }),
        });

        return result.toUIMessageStreamResponse({
            onError: () => "The AI assistant could not complete this request. Please try again.",
        });
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

