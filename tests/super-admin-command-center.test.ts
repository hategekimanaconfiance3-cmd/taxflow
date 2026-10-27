import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSuperAdminDashboardFilters, resolveSuperAdminComparisonRange, resolveSuperAdminDashboardRange } from "../lib/super-admin-command-center";

test("dashboard date presets use Kigali calendar days and bounded ranges", () => {
  const now = new Date("2026-10-27T03:00:00.000Z");
  const todayFilters = parseSuperAdminDashboardFilters({ period: "today" });
  assert.equal(todayFilters.success, true);
  if (!todayFilters.success) return;
  const today = resolveSuperAdminDashboardRange(todayFilters.data, now);
  assert.equal(today.from.toISOString(), "2026-10-26T22:00:00.000Z");
  assert.equal(today.to.toISOString(), now.toISOString());

  const weekFilters = parseSuperAdminDashboardFilters({ period: "7d" });
  assert.equal(weekFilters.success, true);
  if (!weekFilters.success) return;
  const week = resolveSuperAdminDashboardRange(weekFilters.data, now);
  assert.equal(week.from.toISOString(), "2026-10-20T22:00:00.000Z");
});

test("custom ranges reject missing, reversed, and excessively long dates", () => {
  assert.equal(parseSuperAdminDashboardFilters({ period: "custom" }).success, false);
  assert.equal(parseSuperAdminDashboardFilters({ period: "custom", from: "2026-10-20", to: "2026-10-19" }).success, false);
  assert.equal(parseSuperAdminDashboardFilters({ period: "custom", from: "2025-01-01", to: "2026-01-02" }).success, false);
  assert.equal(parseSuperAdminDashboardFilters({ period: "custom", from: "2026-02-30", to: "2026-03-01" }).success, false);
  assert.equal(parseSuperAdminDashboardFilters({ period: "custom", from: "2026-10-01", to: "2026-10-27" }).success, true);
});

test("comparison presets create immediately preceding equivalent windows", () => {
  const filters = parseSuperAdminDashboardFilters({ period: "7d", comparison: "previous_period" });
  assert.equal(filters.success, true);
  if (!filters.success) return;
  const current = resolveSuperAdminDashboardRange(filters.data, new Date("2026-10-27T03:00:00.000Z"));
  const prior = resolveSuperAdminComparisonRange(current, filters.data.comparison);
  assert.equal(prior.to.getTime() + 1, current.from.getTime());
  assert.equal(prior.to.getTime() - prior.from.getTime(), current.to.getTime() - current.from.getTime());
});

test("previous-month comparison clamps month-end dates instead of overflowing", () => {
  const current = { from: new Date("2026-03-31T00:00:00.000Z"), to: new Date("2026-03-31T23:59:59.999Z"), label: "test" };
  const previous = resolveSuperAdminComparisonRange(current, "previous_month");
  assert.equal(previous.from.toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(previous.to.toISOString(), "2026-02-28T23:59:59.999Z");
});
