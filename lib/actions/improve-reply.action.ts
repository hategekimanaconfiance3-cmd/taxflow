"use server";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { requireRRASession } from "@/lib/auth-guard";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isRRAAIInjectionAttempt } from "@/lib/ai/rra-tool-access";

const improveReplySchema = z.object({
    draft: z
        .string()
        .trim()
        .min(10, "Draft must be at least 10 characters.")
        .max(5000, "Draft must be at most 5000 characters."),
    ticketSubject: z
        .string()
        .trim()
        .max(200)
        .optional()
        .default(""),
    ticketCategory: z
        .string()
        .trim()
        .max(100)
        .optional()
        .default(""),
});

export type ImproveReplyInput = z.infer<typeof improveReplySchema>;

export async function improveReply(
    input: ImproveReplyInput,
): Promise<{ improved: string }> {
    // Auth
    const { user } = await requireRRASession(
        "compliance_officer",
        "audit_officer",
        "tax_compliance_officer",
        "audit_investigation_officer",
    );

    // Validate input
    const parsed = improveReplySchema.safeParse(input);
    if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message ?? "Invalid input.");
    }
    const { draft, ticketSubject, ticketCategory } = parsed.data;

    // Injection check (check only the draft text — not PII)
    if (isRRAAIInjectionAttempt(draft)) {
        throw new Error(
            "Your draft contains patterns that cannot be processed. Please revise and try again.",
        );
    }

    // Rate limit: 10 AI improvements per staff member per minute
    const rl = await consumeRateLimit("support-reply-improve", user.id, 10, 60);
    if (!rl.allowed) {
        throw new Error(
            `Too many requests. Please wait ${rl.retryAfterSeconds} second${rl.retryAfterSeconds === 1 ? "" : "s"} before trying again.`,
        );
    }

    // Ensure AI is configured
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        throw new Error(
            "AI improvement is not available. Please contact your system administrator.",
        );
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const model = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-1.5-flash";

    const contextHint =
        ticketCategory || ticketSubject
            ? `\nTicket context: category="${ticketCategory}", subject="${ticketSubject}".`
            : "";

    const systemPrompt = `You are a professional support reply editor for the Rwanda Revenue Authority (RRA) TaxFlow system.
Your task is to rewrite a draft admin reply to be clear, professional, grammatically correct, and helpful.

Rules:
1. Preserve the original meaning, intent, and all relevant details exactly.
2. Correct spelling, grammar, punctuation, and unclear phrasing.
3. Use a professional, respectful, and helpful tone appropriate for government customer support.
4. Keep the reply concise — remove redundancy but preserve all substance.
5. Preserve all identifiers: TINs, case numbers, dates, amounts, ticket references, and technical terms.
6. Do NOT invent new facts, details, or commitments not present in the draft.
7. Do NOT add greetings or closings unless already present in the draft.
8. Do NOT change the language of the response — output in the same language as the draft.
9. Output ONLY the rewritten reply text — no explanations, no preamble, no meta-commentary.${contextHint}`;

    let result: string;
    try {
        const { text } = await generateText({
            model: google(model),
            system: systemPrompt,
            prompt: `Draft reply to rewrite:\n\n${draft}`,
            maxTokens: 1024,
        });
        result = text?.trim() ?? "";
    } catch {
        throw new Error(
            "AI service is temporarily unavailable. Your draft is preserved — please try again in a moment.",
        );
    }

    if (!result) {
        throw new Error(
            "AI returned an empty response. Your draft is preserved — please try again.",
        );
    }

    // Hard cap on output length
    const trimmedResult = result.slice(0, 5000);

    return { improved: trimmedResult };
}
