// ---------------------------------------------------------------------------
// POST /api/knowledge/query — TaxFlow Knowledge Center AI Assistant
//
// Security model:
// • Session validated server-side on every request.
// • Requires an active RRA staff session.
// • Loads only published, non-archived articles visible to the staff member's roles.
// • Streams a helpful, documentation-grounded response.
// • No live data tools — purely documentation Q&A.
// ---------------------------------------------------------------------------

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { z } from "zod";
import db from "@/db/drizzle";
import { knowledgeArticle } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireRRASession } from "@/lib/auth-guard";
import { consumeRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Model setup — mirrors the existing AI route
// ---------------------------------------------------------------------------

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
const google = createGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY ?? "",
});

const MODEL = google(process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || "gemini-3.6-flash");

const MAX_CONTEXT_CHARS = 3000;

const requestSchema = z.object({
    question: z.string().min(1).max(2000),
    section: z.string().max(80).optional(),
});

// ---------------------------------------------------------------------------
// Knowledge Center system prompt
// ---------------------------------------------------------------------------

const KNOWLEDGE_SYSTEM_PROMPT = `You are TaxFlow Assistant, an AI helper embedded in the TaxFlow Knowledge Center.

TaxFlow is Rwanda's National Trade and Tax Control System, developed to help the Rwanda Revenue Authority (RRA) monitor trade activities, detect tax non-compliance, and support transparent supply chain management.

Your role:
- Answer questions about TaxFlow features, policies, processes, and rules.
- Base your answers strictly on the documentation context provided.
- If the documentation does not cover something, say so honestly — do not speculate or invent details.
- Always distinguish between ACTIVE system features and PROPOSED policies (such as the 95% compliance threshold, which is proposed but not yet in force).
- Never claim TaxFlow is directly integrated with EBM or other external government systems — this is about internal TaxFlow records.
- Remind users that for official decisions, they should consult authorized RRA procedures.
- Keep answers clear, concise, and practical.
- Use markdown formatting for clarity where helpful.

Important caveats to include when relevant:
- The tax compliance threshold (default 95%) is CONFIGURABLE by the Super Admin and is a PROPOSED rule, not yet in force.
- Sell-through thresholds are CONFIGURABLE per product, category, or globally — not fixed values.
- TaxFlow does NOT claim direct integration with EBM or other government systems.
- AI-generated alerts always require human review before any enforcement action is taken.`;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
    // ── 1. Authenticate and authorize ────────────────────────────────────────
    let session: Awaited<ReturnType<typeof requireRRASession>>;
    try {
        session = await requireRRASession();
    } catch {
        return new Response("Forbidden", { status: 403 });
    }

    try {
        const limit = await consumeRateLimit("knowledge-ai", session.user.id, 20, 60);
        if (!limit.allowed) {
            return Response.json(
                { error: "Too many requests. Please try again shortly." },
                { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
            );
        }
    } catch (error) {
        console.error("Knowledge AI rate limit unavailable", error);
        return Response.json({ error: "The assistant is temporarily unavailable." }, { status: 503 });
    }

    if (!GOOGLE_API_KEY) {
        console.error("Knowledge AI is unavailable: GOOGLE_GENERATIVE_AI_API_KEY not configured.");
        return Response.json(
            { error: "The AI assistant is not configured. Please contact your administrator." },
            { status: 503 },
        );
    }

    // ── 2. Parse request body ────────────────────────────────────────────────
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
        return Response.json(
            { error: "Invalid request. Please provide a question." },
            { status: 400 },
        );
    }

    const { question, section } = parsed.data;

    // ── 3. Load relevant articles from DB ────────────────────────────────────
    let articleContext = "";
    try {
        const conditions = [
            eq(knowledgeArticle.isPublished, true),
            eq(knowledgeArticle.isArchived, false),
        ];
        if (section) conditions.push(eq(knowledgeArticle.section, section));

        const rows = await db
            .select({
                title: knowledgeArticle.title,
                section: knowledgeArticle.section,
                content: knowledgeArticle.content,
                summary: knowledgeArticle.summary,
                roleVisibility: knowledgeArticle.roleVisibility,
            })
            .from(knowledgeArticle)
            .where(and(...conditions))
            .orderBy(
                // Prioritise section-matching articles first when a section is given
                section
                    ? sql`CASE WHEN ${knowledgeArticle.section} = ${section} THEN 0 ELSE 1 END`
                    : sql`${knowledgeArticle.section}`,
            )
            .limit(100);

        const roles = session.staff.clearanceRoles;
        const articles = rows
            .filter((article) => {
                const visibility = article.roleVisibility ?? [];
                return visibility.length === 0 || roles.some((role) => visibility.includes(role));
            })
            .slice(0, 10);

        // Build context string, capped at MAX_CONTEXT_CHARS
        const contextParts: string[] = [];
        let totalChars = 0;

        for (const article of articles) {
            const part = `## ${article.title} (${article.section})\n${article.summary}\n\n${article.content}`;
            if (totalChars + part.length > MAX_CONTEXT_CHARS) {
                // Include a truncated version if we still have budget
                const remaining = MAX_CONTEXT_CHARS - totalChars;
                if (remaining > 200) {
                    contextParts.push(part.slice(0, remaining) + "\n[... article continues]");
                }
                break;
            }
            contextParts.push(part);
            totalChars += part.length;
        }

        articleContext = contextParts.join("\n\n---\n\n");
    } catch (error) {
        console.error("Knowledge Center: failed to load authorized articles", error);
        return Response.json({ error: "The assistant's documentation is temporarily unavailable." }, { status: 503 });
    }

    // ── 4. Build the system prompt with article context ───────────────────────
    const systemPromptWithContext = articleContext
        ? `${KNOWLEDGE_SYSTEM_PROMPT}\n\n--- TaxFlow Documentation Context ---\n\n${articleContext}\n\n--- End of Documentation Context ---`
        : `${KNOWLEDGE_SYSTEM_PROMPT}\n\n(No matching documentation is available. State that the knowledge base does not contain an answer; do not infer internal policy.)`;

    // ── 5. Stream the response ───────────────────────────────────────────────
    try {
        const result = streamText({
            model: MODEL,
            system: systemPromptWithContext,
            messages: [{ role: "user", content: question }],
            temperature: 0.1,
            maxOutputTokens: 1024,
            maxRetries: 2,
            abortSignal: AbortSignal.timeout(30_000),
        });

        return result.toTextStreamResponse();
    } catch (err) {
        console.error("Knowledge AI stream failed", err);
        return new Response(
            JSON.stringify({ error: "The AI assistant could not complete this request. Please try again." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
        );
    }
}
