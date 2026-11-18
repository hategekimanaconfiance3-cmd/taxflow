import assert from "node:assert/strict";
import { test } from "node:test";
import { translate, translateWithContext } from "../lib/language";

test("industrial integration and price monitoring UI is translated in Kinyarwanda and French", () => {
  const coverage = [
    "Industrial integration",
    "Submit integration request",
    "Industrial integration approvals",
    "Price-change monitoring",
    "Apply filters",
    "Change selling price",
  ];

  for (const source of coverage) {
    assert.notEqual(translate(source, "kiny"), source, `missing Kinyarwanda translation for ${source}`);
    assert.notEqual(translate(source, "fr"), source, `missing French translation for ${source}`);
  }
});

test("localized status labels and unread notification counts remain translated at runtime", () => {
  assert.equal(translate("approved", "kiny"), "byemejwe");
  assert.equal(translate("approved", "fr"), "approuvé");
  assert.equal(translateWithContext("3 unread notifications", "kiny"), "Ubutumwa 3 budasomwe");
  assert.equal(translateWithContext("1 unread notification", "fr"), "1 notification non lue");
  assert.equal(translateWithContext("Factory approved.", "fr"), "Usine approuvée.");
  assert.equal(translateWithContext("Submitted Nov 18, 2026", "kiny"), "Byoherejwe Nov 18, 2026");
  assert.equal(translateWithContext("Latest note: verified", "fr"), "Dernière note : verified");
});
