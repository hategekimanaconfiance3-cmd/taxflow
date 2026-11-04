import assert from "node:assert/strict";
import { test } from "node:test";
import { getAdminNavigationLinks, getAdminSidebarItems } from "../lib/admin-sidebar-config";
import { hasRRAPermission, RRA_ROLE_VALUES } from "../lib/rra-rbac";

test("Anomaly Detection navigation matches the detailed transaction permission", () => {
  for (const role of RRA_ROLE_VALUES) {
    const canReadTransactions = hasRRAPermission(role, "transaction.read");
    const seesAnomalies = getAdminSidebarItems(role).some((item) => item.href === "/admin/anomalies");
    assert.equal(seesAnomalies, canReadTransactions, `${role} anomaly navigation must match transaction.read`);
  }
});

test("Stock Control Administrators get only their dedicated stock-control navigation", () => {
  const items = getAdminSidebarItems("stock_control_admin");
  assert.ok(items.some((item) => item.href === "/admin/stock-control"));
  assert.equal(items.some((item) => item.href === "/admin/intelligence/unregistered"), false);
  assert.equal(items.some((item) => item.href === "/admin/settings"), false);
  assert.equal(items.some((item) => item.href === "/admin/support"), false);
});

test("Stock Overview navigation matches its existing route access without broadening roles", () => {
  const correctionOfficerLinks = getAdminNavigationLinks("correction_officer");
  assert.ok(correctionOfficerLinks.some((item) => item.href === "/admin/stock"));
  assert.equal(getAdminNavigationLinks("stock_control_admin").some((item) => item.href === "/admin/stock"), false);
  assert.equal(getAdminNavigationLinks("super_admin").some((item) => item.href === "/admin/stock"), false);
});

test("Correction Officers can navigate to AI Assistant without gaining Intelligence Hub access", () => {
  const links = getAdminNavigationLinks("correction_officer");
  assert.ok(links.some((item) => item.href === "/admin/intelligence/assistant"));
  assert.equal(links.some((item) => item.href === "/admin/intelligence"), false);
  assert.equal(links.some((item) => item.href === "/admin/intelligence/findings"), false);
});

test("admin command-search destinations are limited to the assigned roles", () => {
  const superAdminLinks = getAdminNavigationLinks("super_admin");
  assert.equal(superAdminLinks.some((item) => item.href === "/admin/traders"), false);
  assert.equal(superAdminLinks.some((item) => item.href === "/admin/super"), true);

  const customsLinks = getAdminNavigationLinks("customs_import_officer");
  assert.equal(customsLinks.some((item) => item.href === "/admin/imports"), true);
  assert.equal(customsLinks.some((item) => item.href === "/admin/super/admins"), false);

  assert.deepEqual(getAdminNavigationLinks("unknown_role"), []);
});

test("Transactions navigation matches the explicit transaction.read permission", () => {
  for (const role of RRA_ROLE_VALUES) {
    const canReadTransactions = hasRRAPermission(role, "transaction.read");
    const seesTransactions = getAdminSidebarItems(role).some((item) => item.href === "/admin/transactions");
    assert.equal(seesTransactions, canReadTransactions, `${role} navigation must match transaction.read`);
  }
});

test("Command Center navigation requires the explicit executive dashboard permission", () => {
  for (const role of RRA_ROLE_VALUES) {
    const canReadDashboard = hasRRAPermission(role, "dashboard.executive.read");
    const seesDashboard = getAdminSidebarItems(role).some((item) => item.href === "/admin/dashboard/overview");
    assert.equal(seesDashboard, canReadDashboard, `${role} navigation must match dashboard.executive.read`);
  }
});

test("Manufacturing Activity navigation matches its explicit read permission for every RRA role", () => {
  for (const role of RRA_ROLE_VALUES) {
    const canReadActivity = hasRRAPermission(role, "taxpayer.activity.read");
    const seesActivity = getAdminSidebarItems(role).some((item) => item.href === "/admin/manufacturing-activity");
    assert.equal(seesActivity, canReadActivity, `${role} activity navigation must match taxpayer.activity.read`);
    assert.equal(hasRRAPermission(role, "taxpayer.account.manage"), true, `${role} should be able to manage manufacturer account status`);
    assert.equal(hasRRAPermission(role, "taxpayer.profile.edit"), true, `${role} should be able to edit limited manufacturer names`);
  }
  assert.equal(hasRRAPermission("correction_officer", "tax.records.read"), false);
  assert.equal(hasRRAPermission("correction_officer", "payments.read"), false);
});
