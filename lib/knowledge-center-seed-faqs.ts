// ---------------------------------------------------------------------------
// Seed FAQ data for the TaxFlow Knowledge Center.
// Pure static data — NOT a "use server" module.
// ---------------------------------------------------------------------------

export interface SeedFaq {
    question: string;
    answer: string;
    section: string;
    sortOrder: number;
}

export const SEED_FAQS: SeedFaq[] = [
    // ── Tax Compliance ──────────────────────────────────────────────────
    {
        section: "compliance",
        sortOrder: 1,
        question: "What is the 95% tax compliance rule?",
        answer: "The 95% tax compliance rule is a proposed policy that would require traders to have paid at least 95% of their eligible tax obligations before being eligible for new purchases. It is calculated as: (Eligible Tax Paid ÷ Eligible Tax Due) × 100. This rule is not yet enforced — it will only apply after official policy approval.",
    },
    {
        section: "compliance",
        sortOrder: 2,
        question: "How is my tax compliance percentage calculated?",
        answer: "Your compliance percentage is: (Total verified tax paid ÷ Total eligible tax due) × 100. For example, if you owe 100,000 RWF and have paid 96,000 RWF, your compliance is 96% — above the proposed 95% threshold.",
    },
    {
        section: "compliance",
        sortOrder: 3,
        question: "What can I do if I fall below the compliance threshold?",
        answer: "You can restore your compliance by: (1) making verified tax payments against outstanding obligations, (2) entering into an approved payment arrangement, (3) successfully disputing an incorrect assessment, or (4) having an authorized exception applied by an RRA officer.",
    },
    {
        section: "compliance",
        sortOrder: 4,
        question: "Can the 95% threshold be changed?",
        answer: "Yes. The compliance threshold is a configurable system setting managed by Super Admin. The default is 95% (0.95) but it can be adjusted. Any change is recorded in the audit trail.",
    },
    {
        section: "compliance",
        sortOrder: 5,
        question: "Does a pending payment dispute affect my compliance calculation?",
        answer: "A formally submitted payment dispute may affect compliance enforcement while it is under review. Contact your assigned Tax Compliance Officer for guidance on your specific situation.",
    },

    // ── Stock Movement ───────────────────────────────────────────────────
    {
        section: "stock-movement",
        sortOrder: 1,
        question: "How is my stock sell-through percentage calculated?",
        answer: "Sell-through % = (Qualifying Sales Quantity ÷ Available Cohort Quantity) × 100. Only verified sales — EBM retail sales and confirmed B2B transfers — count as qualifying sales. The cohort quantity is your baseline stock plus eligible inbound movements.",
    },
    {
        section: "stock-movement",
        sortOrder: 2,
        question: "What is the minimum stock movement required before I can make new purchases?",
        answer: "The required sell-through percentage is configurable and can be set globally, per product category, or per individual product. Contact your Stock Control Administrator or check the Stock Control section to see the threshold that applies to your products.",
    },
    {
        section: "stock-movement",
        sortOrder: 3,
        question: "What happens if I have damaged or expired stock?",
        answer: "Documented damages, expiries, and returns can be submitted as adjustments to your inventory. These require supporting evidence and are reviewed by an authorized officer. Approved adjustments affect both your available cohort and may impact your sell-through calculation.",
    },

    // ── Import and Customs ───────────────────────────────────────────────
    {
        section: "imports",
        sortOrder: 1,
        question: "What information do I need to declare before importing goods?",
        answer: "You must declare: product or raw material name, product category, declared quantity and unit of measurement, country of origin, supplier information (where required), expected arrival details, and supporting documents such as commercial invoices.",
    },
    {
        section: "imports",
        sortOrder: 2,
        question: "What happens if the Customs officer verifies fewer goods than I declared?",
        answer: "The Customs officer records both the declared quantity and the actually verified quantity. The discrepancy is logged permanently. The verified quantity is used for your inventory records. Significant or repeated discrepancies may be flagged for investigation.",
    },
    {
        section: "imports",
        sortOrder: 3,
        question: "Can I change the quantities recorded by Customs after verification?",
        answer: "No. Once a Customs officer submits their verification, the record is locked. Any correction requires a formal request reviewed and approved by an authorized officer, with full documentation of the reason.",
    },
    {
        section: "imports",
        sortOrder: 4,
        question: "How do verified imports become part of my inventory?",
        answer: "Once a Customs officer approves the import verification, the Customs-verified quantity is automatically added to your TaxFlow inventory for that product. Your inventory baseline is updated and future sell-through calculations include this stock.",
    },

    // ── AI Monitoring ────────────────────────────────────────────────────
    {
        section: "ai-monitoring",
        sortOrder: 1,
        question: "What does it mean if I am flagged by the AI monitoring system?",
        answer: "An AI flag means that the system has detected a pattern in your trading records that deviates significantly from your historical baseline or from expected norms. It does not mean you are accused of wrongdoing. An authorized RRA officer must review the alert and may contact you for clarification.",
    },
    {
        section: "ai-monitoring",
        sortOrder: 2,
        question: "Can the AI system suspend my account or impose penalties?",
        answer: "No. The AI system generates alerts for review only. Only an authorized RRA officer can take account actions such as placing an account under review or suspending it, and only after reviewing the evidence and following applicable procedures.",
    },
    {
        section: "ai-monitoring",
        sortOrder: 3,
        question: "What types of activities trigger AI alerts?",
        answer: "Common triggers include: sudden large purchase volumes inconsistent with your history; large gaps between inventory purchases and recorded sales; repeated discrepancies between declared and Customs-verified import quantities; significant changes in business activity patterns.",
    },

    // ── Administrative Roles ─────────────────────────────────────────────
    {
        section: "roles",
        sortOrder: 1,
        question: "Who can approve or reject trader accounts?",
        answer: "Tax Compliance Officers and Super Administrators can approve, reject, or place accounts under review. Suspensions require documented justification and are typically performed by Tax Compliance Officers or Super Admin.",
    },
    {
        section: "roles",
        sortOrder: 2,
        question: "Who can verify imported goods at the border?",
        answer: "Customs & Import Officers are responsible for physically inspecting imported goods and recording verified quantities in TaxFlow. They are the only role authorized to submit import verifications.",
    },
    {
        section: "roles",
        sortOrder: 3,
        question: "Who manages the stock sell-through thresholds?",
        answer: "Stock Control Administrators manage scoped thresholds (per product or category). Super Admin can manage global thresholds. Changes to thresholds are logged in the audit trail.",
    },

    // ── General TaxFlow ──────────────────────────────────────────────────
    {
        section: "about",
        sortOrder: 1,
        question: "What is TaxFlow?",
        answer: "TaxFlow is Rwanda's National Trade and Tax Control System — a digital platform that connects manufacturers, wholesalers, retailers, Customs officers, and RRA administrators to improve tax compliance, monitor trade activities, and increase transparency in Rwanda's commercial sector.",
    },
    {
        section: "about",
        sortOrder: 2,
        question: "Is TaxFlow integrated with the EBM system?",
        answer: "TaxFlow does not currently have a real-time integration with EBM (Electronic Billing Machine) hardware or other government tax systems. EBM-related data in TaxFlow reflects information entered or imported into the platform. This integration is a potential future capability.",
    },
    {
        section: "security",
        sortOrder: 1,
        question: "Who can see my taxpayer data?",
        answer: "Only authorized RRA officers with the specific permissions required for their role can access trader data. All access is logged in the audit trail. Data is shared only on a need-to-know basis aligned with each officer's role responsibilities.",
    },
];
