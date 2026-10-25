import { z } from "zod";

const isCalendarDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, "Enter a real calendar date.").optional().or(z.literal(""));
const metricSchema = z.number().finite().nonnegative().max(1_000_000_000_000).optional();

export const traderDirectoryFilterSchema = z.object({
  query: z.string().trim().max(120).optional().default(""),
  businessRole: z.enum(["manufacturer", "wholesaler", "retailer"]).optional(),
  businessType: z.enum(["registered_business", "institution", "government", "large_bulk_buyer"]).optional(),
  accountStatus: z.enum(["active", "inactive"]).optional(),
  clearanceStatus: z.enum(["pending", "approved", "under_review", "suspended"]).optional(),
  registeredFrom: dateSchema,
  registeredTo: dateSchema,
  activityFrom: dateSchema,
  activityTo: dateSchema,
  activityFromTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  activityToTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  noActivityDuringPeriod: z.boolean().optional().default(false),
  province: z.string().trim().max(100).optional().default(""),
  district: z.string().trim().max(100).optional().default(""),
  sector: z.string().trim().max(100).optional().default(""),
  cell: z.string().trim().max(100).optional().default(""),
  village: z.string().trim().max(100).optional().default(""),
  product: z.string().trim().max(100).optional().default(""),
  relatedTraderTin: z.string().trim().max(32).regex(/^[A-Za-z0-9-]*$/).optional().default(""),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  minTransactions: metricSchema,
  maxTransactions: metricSchema,
  minSalesVolume: metricSchema,
  maxSalesVolume: metricSchema,
  minPurchaseVolume: metricSchema,
  maxPurchaseVolume: metricSchema,
  minStockQuantity: metricSchema,
  maxStockQuantity: metricSchema,
  page: z.number().int().min(1).max(10000).optional().default(1),
}).refine((filters) => !filters.district || Boolean(filters.province), {
  message: "Select a province before selecting a district.", path: ["district"],
}).refine((filters) => !filters.sector || Boolean(filters.district), {
  message: "Select a district before selecting a sector.", path: ["sector"],
}).refine((filters) => !filters.cell || Boolean(filters.sector), {
  message: "Select a sector before selecting a cell.", path: ["cell"],
}).refine((filters) => !filters.village || Boolean(filters.cell), {
  message: "Select a cell before selecting a village.", path: ["village"],
}).refine((filters) => !filters.registeredFrom || !filters.registeredTo || filters.registeredFrom <= filters.registeredTo, {
  message: "Registration start date must be before the end date.", path: ["registeredTo"],
}).refine((filters) => !filters.activityFrom || !filters.activityTo || filters.activityFrom <= filters.activityTo, {
  message: "Activity start date must be before the end date.", path: ["activityTo"],
}).refine((filters) => !filters.activityFromTime || Boolean(filters.activityFrom), {
  message: "Choose an activity start date before setting a start time.", path: ["activityFromTime"],
}).refine((filters) => !filters.activityToTime || Boolean(filters.activityTo), {
  message: "Choose an activity end date before setting an end time.", path: ["activityToTime"],
}).refine((filters) => !filters.noActivityDuringPeriod || Boolean(filters.activityFrom || filters.activityTo), {
  message: "Choose an activity date range to find traders with no activity.", path: ["noActivityDuringPeriod"],
}).refine((filters) => !filters.noActivityDuringPeriod || !filters.product, {
  message: "Clear the product filter when searching for no activity.", path: ["product"],
}).refine((filters) => !filters.activityFromTime || !filters.activityToTime || !filters.activityFrom || !filters.activityTo || filters.activityFrom !== filters.activityTo || filters.activityFromTime <= filters.activityToTime, {
  message: "Activity start time must be before the end time.", path: ["activityToTime"],
}).refine((filters) => filters.minTransactions == null || filters.maxTransactions == null || filters.minTransactions <= filters.maxTransactions, {
  message: "Minimum transaction count must not exceed the maximum.", path: ["maxTransactions"],
}).refine((filters) => filters.minSalesVolume == null || filters.maxSalesVolume == null || filters.minSalesVolume <= filters.maxSalesVolume, {
  message: "Minimum sales volume must not exceed the maximum.", path: ["maxSalesVolume"],
}).refine((filters) => filters.minPurchaseVolume == null || filters.maxPurchaseVolume == null || filters.minPurchaseVolume <= filters.maxPurchaseVolume, {
  message: "Minimum purchase volume must not exceed the maximum.", path: ["maxPurchaseVolume"],
}).refine((filters) => filters.minStockQuantity == null || filters.maxStockQuantity == null || filters.minStockQuantity <= filters.maxStockQuantity, {
  message: "Minimum stock must not exceed the maximum.", path: ["maxStockQuantity"],
}).refine((filters) => !filters.relatedTraderTin || filters.relatedTraderTin.length >= 5, {
  message: "Enter at least five characters for the related trader TIN.", path: ["relatedTraderTin"],
}).refine((filters) => (filters.minStockQuantity == null && filters.maxStockQuantity == null) || Boolean(filters.product), {
  message: "Choose a specific product before filtering stock quantity.", path: ["product"],
});

export type TraderDirectoryFilters = z.infer<typeof traderDirectoryFilterSchema>;
