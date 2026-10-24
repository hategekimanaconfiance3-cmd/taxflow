import assert from "node:assert/strict";
import { test } from "node:test";
import { tinSearchInputSchema } from "../lib/validation/tin-search";

test("TIN validation trims whitespace while preserving identifiers as strings", () => {
  const parsed = tinSearchInputSchema.safeParse("  0010000001  ");
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data, "0010000001");
});

test("TIN validation rejects empty, short, overlong, and unsupported input", () => {
  assert.equal(tinSearchInputSchema.safeParse("").success, false);
  assert.equal(tinSearchInputSchema.safeParse("1234").success, false);
  assert.equal(tinSearchInputSchema.safeParse("1".repeat(33)).success, false);
  assert.equal(tinSearchInputSchema.safeParse("10000/001").success, false);
});
