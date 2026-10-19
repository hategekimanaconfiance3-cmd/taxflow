import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { getRRASystemPrompt, getTraderSystemPrompt } from "../lib/ai/system-prompts";

type EvaluationTool = "getMyTaxStatus" | "explainVat" | "getTaxStatus" | null;
type Persona = "trader" | "rra_staff";

interface AIEvaluationCase {
  caseId: string;
  persona: Persona;
  question: string;
  expectedTool: EvaluationTool;
  syntheticToolResult?: Record<string, string | number | boolean>;
  mustContainAny?: string[];
  mustNotContain?: string[];
}

function buildEvaluationTools(evaluationCase: AIEvaluationCase): ToolSet {
  const result = evaluationCase.syntheticToolResult ?? {};
  switch (evaluationCase.expectedTool) {
    case "getMyTaxStatus":
      return {
        getMyTaxStatus: tool({
          description: "Get the logged-in synthetic trader's recorded VAT totals and informational balance.",
          inputSchema: z.object({}),
          execute: async () => result,
        }),
      };
    case "explainVat":
      return {
        explainVat: tool({
          description: "Explain the configured TaxFlow VAT calculation. This tool cannot verify official RRA law or filing deadlines.",
          inputSchema: z.object({ includeBreakdown: z.boolean().default(false) }),
          execute: async () => result,
        }),
      };
    case "getTaxStatus":
      return {
        getTaxStatus: tool({
          description: "Retrieve the tax status for one synthetic trader by exact TIN.",
          inputSchema: z.object({ traderTin: z.string() }),
          execute: async () => result,
        }),
      };
    case null:
      return {};
  }
}

function includesAny(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const normalized = text.toLocaleLowerCase();
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase()));
}

async function main(): Promise<void> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error("Set GOOGLE_GENERATIVE_AI_API_KEY to run the synthetic model evaluation.");

  const source = await readFile(new URL("../tests/fixtures/ai-quality-cases.json", import.meta.url), "utf8");
  const cases = z.array(z.object({
    caseId: z.string().min(1),
    persona: z.enum(["trader", "rra_staff"]),
    question: z.string().min(1),
    expectedTool: z.enum(["getMyTaxStatus", "explainVat", "getTaxStatus"]).nullable(),
    syntheticToolResult: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    mustContainAny: z.array(z.string()).optional(),
    mustNotContain: z.array(z.string()).optional(),
  })).parse(JSON.parse(source)) as AIEvaluationCase[];

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google(process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || "gemini-3.6-flash");
  const outcomes: Array<{ caseId: string; passed: boolean; expectedTool: EvaluationTool; toolCalled: string | null }> = [];

  for (const evaluationCase of cases) {
    const result = await generateText({
      model,
      system: evaluationCase.persona === "trader" ? getTraderSystemPrompt(new Date("2026-01-15T12:00:00.000Z")) : getRRASystemPrompt(new Date("2026-01-15T12:00:00.000Z")),
      messages: [{ role: "user", content: evaluationCase.question }],
      tools: buildEvaluationTools(evaluationCase),
      stopWhen: stepCountIs(3),
      temperature: 0,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(30_000),
    });

    const toolCalled = result.toolCalls[0]?.toolName ?? null;
    const correctTool = toolCalled === evaluationCase.expectedTool;
    const answer = result.text;
    const answerHasExpectedContent = includesAny(answer, evaluationCase.mustContainAny ?? []);
    const answerAvoidsForbiddenContent = !(evaluationCase.mustNotContain ?? []).some((term) => answer.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    outcomes.push({
      caseId: evaluationCase.caseId,
      passed: correctTool && answerHasExpectedContent && answerAvoidsForbiddenContent,
      expectedTool: evaluationCase.expectedTool,
      toolCalled,
    });
  }

  const passed = outcomes.filter((outcome) => outcome.passed).length;
  const report = {
    model: process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || "gemini-3.6-flash",
    total: outcomes.length,
    passed,
    score: outcomes.length === 0 ? 0 : Number((passed / outcomes.length).toFixed(3)),
    outcomes,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (passed !== outcomes.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("AI evaluation failed", error instanceof Error ? error.message : "Unexpected error");
  process.exitCode = 1;
});
