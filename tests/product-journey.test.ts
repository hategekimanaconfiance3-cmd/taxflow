import assert from "node:assert/strict";
import { test } from "node:test";
import { getJourneyChildren, getJourneyRootBusinessIds, isJourneyCycle, type JourneyEdge } from "../lib/product-journey-graph";
import { productJourneyQuerySchema } from "../lib/validation/product-journey.schema";

const edge = (id: string, sellerId: string, buyerId: string | null): JourneyEdge => ({ id, sellerId, buyerId });

test("journey roots and child branches preserve a split delivery", () => {
    const records = [edge("m-w1", "m", "w1"), edge("m-w2", "m", "w2"), edge("w1-r1", "w1", "r1"), edge("w1-r2", "w1", "r2")];
    assert.deepEqual(getJourneyRootBusinessIds(records), ["m"]);
    const rendered = new Set<string>();
    assert.deepEqual(getJourneyChildren(records, "m", rendered).map((record) => record.id), ["m-w1", "m-w2"]);
    assert.deepEqual(getJourneyChildren(records, "w1", rendered).map((record) => record.id), ["w1-r1", "w1-r2"]);
});

test("journey includes separate suppliers feeding the same buyer", () => {
    const records = [edge("s1-r", "s1", "r"), edge("s2-r", "s2", "r")];
    assert.deepEqual(getJourneyRootBusinessIds(records), ["s1", "s2"]);
});

test("journey cycle handling terminates and duplicate edges are only rendered once", () => {
    const records = [edge("a-b", "a", "b"), edge("b-a", "b", "a"), edge("a-b", "a", "b")];
    assert.deepEqual(getJourneyRootBusinessIds(records), ["a"]);
    assert.equal(isJourneyCycle(new Set(["a", "b"]), "a"), true);
    const rendered = new Set<string>();
    const rootEdges = getJourneyChildren(records, "a", rendered);
    const nextRendered = new Set([...rendered, ...rootEdges.map((record) => record.id)]);
    assert.deepEqual(getJourneyChildren(records, "b", nextRendered).map((record) => record.id), ["b-a"]);
});

test("journey search validates status, dates, and safe offsets", () => {
    assert.equal(productJourneyQuerySchema.safeParse({ query: "BATCH-1", status: "all", offset: 0 }).success, true);
    assert.equal(productJourneyQuerySchema.safeParse({ status: "unknown", offset: 0 }).success, false);
    assert.equal(productJourneyQuerySchema.safeParse({ from: "2026-10-20T00:00:00.000Z", to: "2026-10-19T00:00:00.000Z" }).success, false);
    assert.equal(productJourneyQuerySchema.safeParse({ offset: -1 }).success, false);
});
