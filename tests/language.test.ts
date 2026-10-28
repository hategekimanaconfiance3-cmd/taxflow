import assert from "node:assert/strict";
import { test } from "node:test";
import { LANGS, normalizeLangCode, translate, translateWithContext } from "../lib/language";

test("language selector exposes English, Kinyarwanda, and French locale codes", () => {
  assert.deepEqual(LANGS.map(({ code }) => code), ["en", "rw", "fr"]);
});

test("legacy Kinyarwanda preference is normalized without losing saved user choice", () => {
  assert.equal(normalizeLangCode("kiny"), "rw");
  assert.equal(normalizeLangCode("rw"), "rw");
  assert.equal(normalizeLangCode("unknown"), null);
});

test("catalog translates shared business language and safely falls back for missing copy", () => {
  assert.equal(translate("Taxpayer", "rw"), "Usoreshwa");
  assert.equal(translate("Taxpayer", "fr"), "Contribuable");
  assert.equal(translate("Uncatalogued server message", "fr"), "Uncatalogued server message");
  assert.equal(translate("Taxpayer", "en"), "Taxpayer");
});

test("unread notification count keeps its number and uses the selected language", () => {
  assert.equal(translateWithContext("3 unread notifications", "rw"), "Ubutumwa 3 budasomwe");
  assert.equal(translateWithContext("1 unread notification", "fr"), "1 notification non lue");
});
