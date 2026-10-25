import assert from "node:assert/strict";
import { test } from "node:test";
import { taxpayerInformationRequestSchema } from "../lib/validation/rra-case.schema";

test("taxpayer information requests require a case, supported request type, and actionable details", () => {
  assert.equal(taxpayerInformationRequestSchema.safeParse({
    caseId: "case-1",
    requestType: "documents",
    details: "Provide the signed monthly inventory reconciliation.",
  }).success, true);
  assert.equal(taxpayerInformationRequestSchema.safeParse({
    caseId: "case-1",
    requestType: "approve",
    details: "Change the taxpayer status.",
  }).success, false);
  assert.equal(taxpayerInformationRequestSchema.safeParse({
    caseId: "case-1",
    requestType: "corrections",
    details: "short",
  }).success, false);
  assert.equal(taxpayerInformationRequestSchema.safeParse({
    caseId: "case-1",
    requestType: "corrections",
    details: "Correct the missing declaration period.",
    status: "approved",
  }).success, false);
});
