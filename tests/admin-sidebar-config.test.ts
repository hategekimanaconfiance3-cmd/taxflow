import assert from "node:assert/strict";
import { test } from "node:test";
import { getAdminSidebarItems } from "../lib/admin-sidebar-config";

test("Anomaly Detection navigation is visible to the same operational roles as its page", () => {
  for (const role of [
    "compliance_officer",
    "tax_compliance_officer",
    "audit_officer",
    "audit_investigation_officer",
    "data_ai_analyst",
  ]) {
    assert.ok(
      getAdminSidebarItems(role).some((item) => item.href === "/admin/anomalies"),
      `${role} should see the Anomaly Detection link`,
    );
  }
  assert.equal(getAdminSidebarItems("product_traceability_officer").some((item) => item.href === "/admin/anomalies"), false);
  assert.equal(getAdminSidebarItems("super_admin").some((item) => item.href === "/admin/anomalies"), false);
});
