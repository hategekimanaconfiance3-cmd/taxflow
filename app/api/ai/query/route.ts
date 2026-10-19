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
import { rraStaff, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { consumeRateLimit, getRequestIdentity } from "@/lib/rate-limit";
import { createTraderTools } from "@/lib/ai/tools/trader-tools";
import { createRraActionTools } from "@/lib/ai/tools/rra-action-tools";
import {
    lookupTrader,
    searchTraders,
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
import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";
import { getRRAAIToolNames, type RRAAIToolName } from "@/lib/ai/rra-tool-access";
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
    messages: z.array(z.unknown()).min(1).max(20),
}).strict();

const messageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.unknown()).max(40),
}).passthrough();

const textPartSchema = z.object({ type: z.literal("text"), text: z.string().max(4_000) }).passthrough();

function parseMessages(input: unknown): { rawMessages: Record<string, unknown>[]; textMessages: { role: "user" | "assistant"; content: string }[] } | null {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return null;

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    const rawMessages: Record<string, unknown>[] = [];
    let totalCharacters = 0;
    for (const candidate of parsed.data.messages) {
        const message = messageSchema.safeParse(candidate);
        if (!message.success) return null;

        const parsedParts = message.data.parts.map((part) => {
            const textPart = textPartSchema.safeParse(part);
            if (textPart.success) return textPart.data;
            if (typeof part === "object" && part !== null && "type" in part && typeof part.type === "string" && part.type.startsWith("tool-")) return part;
            return null;
        });
        if (parsedParts.some((part) => part === null)) return null;
        const safeParts = parsedParts.filter((part) => part !== null);
        const content = safeParts
            .filter((part) => "text" in part && typeof part.text === "string")
            .map((part) => part.text as string)
            .join("\n")
            .trim();
        totalCharacters += content.length;
        if (totalCharacters > 12_000) return null;
        rawMessages.push({ ...message.data, parts: safeParts });
        if (content) messages.push({ role: message.data.role, content });
    }

    const lastMessage = rawMessages.at(-1);
    const isApprovalResponse = lastMessage?.role === "assistant" && Array.isArray(lastMessage.parts) && lastMessage.parts.some((part) =>
        typeof part === "object" && part !== null && "type" in part && typeof part.type === "string" && part.type.startsWith("tool-") &&
        "approval" in part && typeof part.approval === "object" && part.approval !== null && "approved" in part.approval,
    );
    if (messages.length === 0 || (lastMessage?.role !== "user" && !isApprovalResponse)) return null;
    return { rawMessages, textMessages: messages };
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

    const parsedMessages = parseMessages(body);
    if (!parsedMessages) {
        return Response.json({ error: "Invalid chat request. Please shorten your message and try again." }, { status: 400 });
    }

    // Extract the latest user message for audit logging
    const lastUserMsg = [...parsedMessages.textMessages]
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

    for (const message of parsedMessages.textMessages) {
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
    const rraToolRegistry = {
        lookupTrader, searchTraders, getTransactions, getStockLevels, getTaxStatus,
        getRiskAssessment, getRevenueForecastTool, getSystemStats, getBehavioralAnalysis,
        traceSupplyChain, traceProductJourney, getImportDeclarations,
    } satisfies Record<RRAAIToolName, ToolSet[RRAAIToolName]>;
    const rraReadTools: ToolSet = isRRARole(staffClearance)
        ? Object.fromEntries(getRRAAIToolNames(staffClearance).map((name) => [name, rraToolRegistry[name]])) as ToolSet
        : {};
    const tools: ToolSet = isTrader
        ? createTraderTools(userId)
        : { ...rraReadTools, ...createRraActionTools(staffClearance) };

    // ── 7. Stream the response ───────────────────────────────────────────────
    try {
        const validatedMessages = await validateUIMessages({
            messages: parsedMessages.rawMessages,
            tools,
        });
        const modelMessages = await convertToModelMessages(validatedMessages, { tools });
        const result = streamText({
            model: MODEL,
            system: isTrader ? getTraderSystemPrompt() : getRRASystemPrompt(),
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(5),
            temperature: 0.1,      // low temperature for factual accuracy
            maxOutputTokens: 2048,
            abortSignal: AbortSignal.timeout(30_000),
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

