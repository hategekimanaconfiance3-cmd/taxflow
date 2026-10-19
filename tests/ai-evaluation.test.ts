import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getRRAAIToolNames, type RRAAIToolName } from "../lib/ai/rra-tool-access";
import { hasRRAPermission } from "../lib/rra-rbac";

interface EvaluationCase {
  caseId: string;
  role: string;
  syntheticPrompt: string;
  allowedTool: string | null;
  deniedTool: string | null;
}

const cases = JSON.parse(readFileSync(new URL("./fixtures/ai-evaluation-cases.json", import.meta.url), "utf8")) as EvaluationCase[];

test("synthetic role evaluation cases match the assistant tool allowlist", () => {
  for (const evaluationCase of cases) {
    const actual = getRRAAIToolNames(evaluationCase.role);
    assert.ok(evaluationCase.syntheticPrompt.length > 0, `${evaluationCase.caseId} has a prompt`);
    if (evaluationCase.allowedTool) assert.ok(actual.includes(evaluationCase.allowedTool as RRAAIToolName), `${evaluationCase.caseId}: expected ${evaluationCase.allowedTool}`);
    if (evaluationCase.deniedTool) assert.ok(!actual.includes(evaluationCase.deniedTool as RRAAIToolName), `${evaluationCase.caseId}: unexpected ${evaluationCase.deniedTool}`);
  }
});

test("only the data and AI analyst can review feedback", () => {
  assert.equal(hasRRAPermission("data_ai_analyst", "ai.feedback.review"), true);
  assert.equal(hasRRAPermission("super_admin", "ai.feedback.review"), false);
  assert.equal(hasRRAPermission("director_executive", "ai.feedback.review"), false);
});

test("unknown roles receive no assistant tools", () => {
  assert.deepEqual(getRRAAIToolNames("unknown_role"), []);
  assert.deepEqual(getRRAAIToolNames("retailer"), []);
});
