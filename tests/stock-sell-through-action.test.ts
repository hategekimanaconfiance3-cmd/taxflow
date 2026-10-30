import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

function actionBlock(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} should be present`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next >= 0 ? next : undefined);
}

test("manufacturer-only restock request derives the business from the authenticated trader and writes request plus audit transactionally", async () => {
  const source = await readFile(new URL("../lib/actions/stock-sell-through.action.ts", import.meta.url), "utf8");
  const action = actionBlock(source, "createRestockRequestAction");

  assert.match(action, /requireTraderSession\(\["manufacturer"\]\)/);
  assert.ok(action.indexOf('requireTraderSession(["manufacturer"])') < action.indexOf("const requestId"), "role check must reject unauthorized traders before request processing");
  assert.match(action, /const businessId = session\.user\.id/);
  assert.doesNotMatch(action, /businessId:\s*field\(formData/);
  assert.match(action, /db\.transaction\(async \(tx\) =>/);
  assert.match(action, /tx\.insert\(stockRestockRequest\)/);
  assert.match(action, /tx\.insert\(auditLog\)/);
  assert.doesNotMatch(action, /tx\.(?:insert|update|delete)\(stockMovement\)/);
  assert.doesNotMatch(action, /tx\.update\(stock\)/);
  assert.doesNotMatch(action, /tx\.insert\(transaction\)/);
  assert.match(action, /evaluateRequest\(tx, businessId, parsed\.data\.productId, at\)/);
  assert.ok(action.indexOf('for("update")') < action.indexOf("const at = new Date()"), "evaluation time must be captured after the stock lock");
  assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(source, /\.for\("update"\)/);
});

test("restock navigation and dashboard shortcuts are not offered to wholesalers or retailers; direct page access is restricted", async () => {
  const [sidebar, quickActions, page] = await Promise.all([
    readFile(new URL("../lib/sidebar-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/dashboard/quick-actions/quick-actions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(dashboard)/dashboard/restock/page.tsx", import.meta.url), "utf8"),
  ]);

  const restockNav = sidebar.match(/label: "Restock Requests",[\s\S]*?roles: (\[[^\]]+\]|"all")/);
  assert.ok(restockNav, "restock navigation should declare its allowed roles");
  assert.equal(restockNav[1], '["manufacturer"]');
  assert.doesNotMatch(quickActions, /label: ['"]Restock['"], href: ['"]\/dashboard\/restock/);
  assert.match(quickActions, /label: 'Sell to Buyer', href: '\/dashboard\/sell'/);
  assert.match(quickActions, /label: 'Record Sale', href: '\/dashboard\/record-sale'/);
  assert.match(page, /requireTraderSession\(\["manufacturer"\]\)/);
  assert.ok(page.indexOf('requireTraderSession(["manufacturer"])') < page.indexOf("db.selectDistinct"), "role check must run before restock data is read");
});

test("threshold edits enforce explicit global versus scoped RBAC inside the server action", async () => {
  const source = await readFile(new URL("../lib/actions/stock-sell-through.action.ts", import.meta.url), "utf8");
  const action = actionBlock(source, "createSellThroughThresholdAction");

  assert.match(action, /requireRRAPermission\("stock\.threshold\.read"\)/);
  assert.match(action, /stock\.threshold\.manage\.global/);
  assert.match(action, /stock\.threshold\.manage\.scoped/);
  assert.match(action, /hasRRAPermission\(role, managePermission\)/);
  assert.match(action, /tx\.insert\(auditLog\)/);
  assert.match(action, /effectiveAt\.getTime\(\) < Date\.now\(\)/);
});

test("exception review and balance attestation use distinct permissions, audit writes, and safe transaction boundaries", async () => {
  const source = await readFile(new URL("../lib/actions/stock-sell-through.action.ts", import.meta.url), "utf8");
  const review = actionBlock(source, "reviewRestockExceptionAction");
  const attest = actionBlock(source, "attestStockSellThroughBaselineAction");

  assert.match(review, /requireRRAPermission\("stock\.restock\.exception\.review"\)/);
  assert.match(review, /request\.requestedByUserId === actor\.id/);
  assert.match(review, /db\.transaction\(async \(tx\) =>/);
  assert.match(review, /tx\.insert\(auditLog\)/);
  assert.doesNotMatch(review, /tx\.(?:insert|update|delete)\(stockMovement\)/);
  assert.doesNotMatch(review, /tx\.update\(stock\)/);
  assert.doesNotMatch(review, /tx\.(?:insert|update)\(transaction\)/);
  assert.match(attest, /requireRRAPermission\("stock\.restock\.baseline\.attest"\)/);
  assert.match(attest, /physicalStockIndependentlyVerified: false/);
  assert.match(attest, /db\.transaction\(async \(tx\) =>/);
  assert.match(attest, /tx\.insert\(auditLog\)/);
  assert.match(attest, /if \(!stockRow\) throw new Error\("MISSING_STOCK_ROW"\)/);
  assert.ok(attest.indexOf('for("update")') < attest.indexOf("const at = new Date()"), "attestation time must be captured after the stock lock");
});
