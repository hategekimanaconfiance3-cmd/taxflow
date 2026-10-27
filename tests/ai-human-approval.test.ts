import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { getRRASystemPrompt } from "../lib/ai/system-prompts";

test("RRA AI is advisory, labels potential findings, and defers official decisions to humans", () => {
  const prompt = getRRASystemPrompt(new Date("2026-10-23T00:00:00.000Z"));
  assert.match(prompt, /read-only/i);
  assert.match(prompt, /never make, approve, execute, or finalize an official decision/i);
  assert.match(prompt, /recommendations are not approvals/i);
  assert.match(prompt, /potential\/system-generated indicators/i);
  assert.match(prompt, /FACT \(recorded data\)[\s\S]*CALCULATION \(reproducible arithmetic\)[\s\S]*SIGNAL \(rule\/model output\)[\s\S]*INTERPRETATION \(your explanation\)[\s\S]*UNKNOWN \(missing or unverified evidence\)/);
  assert.match(prompt, /incomplete status or withholds its score/i);
  assert.match(prompt, /AI Recommendation — Human Review Required/);
  assert.match(prompt, /getTaxpayerIntelligence/);
});

test("the chat API exposes read-only RRA tools and rejects client approval responses", async () => {
  const source = await readFile(new URL("../app/api/ai/query/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createRraActionTools/);
  assert.match(source, /const tools: ToolSet = isTrader \? createTraderTools\(userId\) : rraReadTools/);
  assert.match(source, /lastMessage\.data\.role !== "user"/);
  assert.match(source, /isRRAAIInjectionAttempt\(message\.content\)/);
  assert.match(source, /getRRAAIToolNames\(staffRoles\)/);
});

test("automated compliance checks cannot change taxpayer status", async () => {
  const source = await readFile(new URL("../lib/actions/compliance.action.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /AUTO_SUSPENDED/);
  assert.doesNotMatch(source, /clearanceStatus:\s*['"]suspended['"]/);
  assert.match(source, /only a signal for human review/i);
});
