import { z } from "zod";

export const superAdminDashboardFilterSchema = z.object({
  period: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
  comparison: z.enum(["previous_period", "previous_month", "previous_year"]).default("previous_period"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((value, context) => {
  if (value.period !== "custom") return;
  if (!value.from || !value.to || value.from > value.to) {
    context.addIssue({ code: "custom", message: "Choose a valid custom date range." });
    return;
  }
  const validDate = (input: string) => {
    const parsed = new Date(`${input}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
  };
  if (!validDate(value.from) || !validDate(value.to)) {
    context.addIssue({ code: "custom", message: "Enter real calendar dates for the custom range." });
    return;
  }
  const start = Date.parse(`${value.from}T00:00:00Z`);
  const end = Date.parse(`${value.to}T00:00:00Z`);
  if (end - start > 365 * 86_400_000) {
    context.addIssue({ code: "custom", message: "Custom ranges can be up to 366 days." });
  }
});

export type SuperAdminDashboardFilters = z.input<typeof superAdminDashboardFilterSchema>;
export type SuperAdminDashboardPeriod = z.infer<typeof superAdminDashboardFilterSchema>["period"];
export type SuperAdminDashboardComparison = z.infer<typeof superAdminDashboardFilterSchema>["comparison"];
export type DashboardRange = { from: Date; to: Date; label: string };

const KIGALI_TIME_ZONE = "Africa/Kigali";

export function parseSuperAdminDashboardFilters(input: unknown) {
  return superAdminDashboardFilterSchema.safeParse(input);
}

function kigaliDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KIGALI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function kigaliDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+02:00`);
}

export function resolveSuperAdminDashboardRange(filters: z.infer<typeof superAdminDashboardFilterSchema>, now: Date): DashboardRange {
  if (filters.period === "custom" && filters.from && filters.to) {
    return {
      from: kigaliDayStart(filters.from),
      to: new Date(`${filters.to}T23:59:59.999+02:00`),
      label: `${filters.from} to ${filters.to} (Kigali time)`,
    };
  }
  if (filters.period === "today") {
    return { from: kigaliDayStart(kigaliDateKey(now)), to: now, label: "Today (Kigali time)" };
  }
  const days = filters.period === "7d" ? 7 : filters.period === "90d" ? 90 : 30;
  const from = kigaliDayStart(kigaliDateKey(now));
  from.setTime(from.getTime() - (days - 1) * 86_400_000);
  return { from, to: now, label: `Last ${days} days` };
}

export function resolveSuperAdminComparisonRange(current: DashboardRange, comparison: SuperAdminDashboardComparison): DashboardRange {
  const from = new Date(current.from);
  const to = new Date(current.to);
  const shiftCalendarMonth = (date: Date, amount: number) => {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  };
  if (comparison === "previous_month") {
    shiftCalendarMonth(from, -1);
    shiftCalendarMonth(to, -1);
  } else if (comparison === "previous_year") {
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    to.setUTCFullYear(to.getUTCFullYear() - 1);
  } else {
    const length = current.to.getTime() - current.from.getTime() + 1;
    to.setTime(current.from.getTime() - 1);
    from.setTime(from.getTime() - length);
  }
  return { from, to, label: comparison.replaceAll("_", " ") };
}
