import { isRRARole, type RRARole } from "@/lib/rra-rbac";

export const RRA_AI_TOOL_NAMES = [
    "lookupTrader",
    "searchTraders",
    "getTransactions",
    "getStockLevels",
    "getTaxStatus",
    "getRiskAssessment",
    "getRevenueForecastTool",
    "getSystemStats",
    "getBehavioralAnalysis",
    "traceSupplyChain",
    "traceProductJourney",
    "getImportDeclarations",
] as const;

export type RRAAIToolName = (typeof RRA_AI_TOOL_NAMES)[number];

export const RRA_AI_TOOL_ACCESS: Record<RRARole, readonly RRAAIToolName[]> = {
    super_admin: [],
    director_executive: ["getSystemStats", "getRevenueForecastTool"],
    tax_compliance_officer: ["lookupTrader", "searchTraders", "getTransactions", "getTaxStatus"],
    audit_investigation_officer: ["lookupTrader", "searchTraders", "getTransactions", "getStockLevels", "getTaxStatus", "getRiskAssessment", "getRevenueForecastTool", "getSystemStats", "getBehavioralAnalysis", "traceSupplyChain", "traceProductJourney", "getImportDeclarations"],
    product_traceability_officer: ["getTransactions", "getStockLevels", "traceSupplyChain", "traceProductJourney"],
    customs_import_officer: ["getImportDeclarations"],
    payments_reconciliation_officer: ["getTaxStatus"],
    data_ai_analyst: ["getSystemStats", "getRevenueForecastTool", "getBehavioralAnalysis", "getRiskAssessment"],
    compliance_officer: ["lookupTrader", "searchTraders", "getTransactions", "getTaxStatus", "getRiskAssessment", "traceSupplyChain"],
    audit_officer: ["lookupTrader", "searchTraders", "getTransactions", "getStockLevels", "getTaxStatus", "getRiskAssessment", "getRevenueForecastTool", "getSystemStats", "getBehavioralAnalysis", "traceSupplyChain", "traceProductJourney", "getImportDeclarations"],
    stock_officer: ["lookupTrader", "getTransactions", "getStockLevels", "traceProductJourney"],
    correction_officer: [],
    reporting_officer: ["getSystemStats", "getRevenueForecastTool"],
};

export function getRRAAIToolNames(role: string): readonly RRAAIToolName[] {
    if (!isRRARole(role)) return [];
    return RRA_AI_TOOL_ACCESS[role] ?? [];
}
