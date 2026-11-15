// ---------------------------------------------------------------------------
// Default Knowledge Center article content.
// This file is NOT a "use server" module — it is pure static data.
// ---------------------------------------------------------------------------

export interface DefaultArticle {
    slug: string;
    title: string;
    section: string;
    summary: string;
    content: string;
    tags: string[];
}

export const DEFAULT_KNOWLEDGE_ARTICLES: DefaultArticle[] = [
    // ── 1. About TaxFlow ──────────────────────────────────────────────────
    {
        slug: "what-is-taxflow",
        title: "What is TaxFlow?",
        section: "about",
        summary: "TaxFlow is Rwanda's National Trade and Tax Control System, designed to improve tax compliance, monitor trade activities, and connect manufacturers, wholesalers, retailers, Customs officers, and RRA administrators.",
        tags: ["taxflow", "overview", "rwanda", "rra", "objectives"],
        content: `# What is TaxFlow?

TaxFlow is Rwanda's National Trade and Tax Control System — a comprehensive digital platform developed to improve tax compliance, strengthen trade monitoring, and increase transparency across Rwanda's commercial sector.

## Why Was TaxFlow Developed?

Rwanda Revenue Authority (RRA) identified several persistent challenges in the existing trade and tax environment:

1. **Underreporting of sales** — Traders purchasing goods but recording fewer sales in EBM (Electronic Billing Machine) than the quantities actually sold or moved.
2. **Unregistered commercial activity** — Businesses conducting commercial activities without valid TIN (Taxpayer Identification Number) registration.
3. **Incomplete tax payments** — Traders possessing valid TIN numbers but failing to pay their full tax obligations.
4. **Unverified imports** — Imported goods entering Rwanda without adequate verification against officially declared information.
5. **Limited supply chain visibility** — Insufficient visibility into the movement of goods between manufacturers, wholesalers, and retailers across the national supply chain.

## Main Objectives

TaxFlow was developed to address these challenges through the following objectives:

- **Improve tax compliance** — Help traders understand and meet their tax obligations.
- **Reduce underreporting of sales** — Cross-reference inventory, purchases, and EBM records to identify discrepancies.
- **Improve TIN verification** — Ensure only legitimately registered traders participate in the controlled trading ecosystem.
- **Monitor inventory movements** — Track goods from raw materials through production to final sale.
- **Verify imported goods** — Enable Customs officers to compare declared quantities against physically inspected quantities.
- **Improve transparency** — Create an auditable record of commercial activities across the supply chain.
- **Help RRA detect unusual activities** — Use AI-powered analysis to flag trading patterns that deviate significantly from historical baselines.
- **Improve national trade monitoring** — Provide RRA administrators with a comprehensive view of Rwanda's commercial landscape.

## How TaxFlow Connects Stakeholders

TaxFlow brings together multiple participants in Rwanda's trade and tax ecosystem:

| Stakeholder | Role in TaxFlow |
|------------|----------------|
| **Manufacturers** | Register raw material purchases, record production activities, declare finished goods |
| **Wholesalers** | Record imports, purchases from manufacturers, and sales to retailers |
| **Retailers** | Record purchases from wholesalers and report EBM sales |
| **Customs Officers** | Inspect and verify imported goods, record actual quantities, flag discrepancies |
| **Tax Compliance Officers** | Monitor trader compliance, follow up on outstanding obligations |
| **AI/Risk Analysts** | Review AI-generated alerts, assess risk levels, initiate investigations |
| **Super Administrators** | Manage the system, approve accounts, configure policies |

> **Note:** TaxFlow is a proposed and actively developed system. Some features described in this documentation represent implemented functionality, while others are proposed capabilities pending policy approval and system integration.
`,
    },

    // ── 2. AI Monitoring ─────────────────────────────────────────────────
    {
        slug: "ai-powered-monitoring",
        title: "AI-Powered Monitoring System",
        section: "ai-monitoring",
        summary: "TaxFlow uses artificial intelligence to analyze historical trader data, detect anomalies, generate risk alerts, and assist RRA officers. AI recommendations always require human review before any action is taken.",
        tags: ["ai", "anomaly-detection", "risk", "monitoring", "alerts"],
        content: `# AI-Powered Monitoring System

TaxFlow incorporates an AI monitoring system that analyzes historical data to identify unusual trading patterns and generate risk alerts for review by authorized RRA officers.

> **Important:** AI findings are advisory only. No trader account action, penalty, or suspension may be taken based solely on an AI alert. All alerts must be reviewed by an authorized RRA officer who makes the official decision.

## Historical Data Collection

The AI system analyzes a wide range of historical records, including:

1. Import declarations and quantities
2. Customs inspection and verification records
3. Raw material purchases and receipts
4. Manufacturing activities and production batches
5. Finished goods inventory levels
6. Inventory movement records
7. EBM (Electronic Billing Machine) sales records
8. B2B purchase transactions
9. Tax assessments issued
10. Tax payment records
11. Previous compliance issues and case history
12. Account status history and administrative actions

## Anomaly Detection

The AI analyzes these historical records to identify statistically unusual activities. Examples include:

### Example 1 — Unusual Purchase Volume
A trader who consistently purchases approximately 500 bags of cement per month suddenly declares a purchase of 5,000 bags without an obvious business explanation (such as a large construction contract). The AI flags this as a significant deviation from the trader's established baseline.

### Example 2 — Inventory Reconciliation Gap
A trader purchases 1,000 kg of rice. Their EBM records show sales of only 600 kg. Their inventory records do not account for the remaining 400 kg through transfers, damages, or other documented movements. The AI flags the unexplained inventory gap.

### Example 3 — Repeated Customs Discrepancies
A trader repeatedly declares quantities that differ significantly from the quantities physically verified by Customs officers. A pattern of repeated discrepancies is flagged for investigation.

### Example 4 — Sudden Business Activity Change
A trader's reported business activities — the types of products they buy, sell, or import — suddenly change significantly compared with their established historical patterns, without a business registration change to explain the shift.

## AI Alert Structure

Every AI-generated alert includes the following information:

- **Trader information** — TIN, business name, account type, registered location
- **Type of unusual activity** — Purchase anomaly, inventory gap, Customs discrepancy, etc.
- **Description** — A clear explanation of what was detected and why it is flagged
- **Supporting historical records** — Relevant data points that triggered the alert
- **Risk level** — Low, Medium, High, or Critical
- **Date and time** — When the alert was generated
- **Recommended investigation steps** — Suggested next actions for the reviewing officer

## Risk Level Classifications

| Level | Description |
|-------|-------------|
| **Low** | Minor deviation from baseline; may have a simple explanation; monitor |
| **Medium** | Moderate deviation; warrants a closer review of records |
| **High** | Significant anomaly; a formal review or case should be opened |
| **Critical** | Severe anomaly indicating possible deliberate non-compliance; escalate immediately |

## Human Decision-Making

The TaxFlow AI system is designed to assist RRA officers, not to replace their judgment. The AI:

- **Generates alerts** — but does not impose penalties or restrictions
- **Provides recommendations** — but authorized officers must review evidence and decide
- **Analyzes patterns** — but cannot access or verify information outside the TaxFlow system
- **Flags risks** — but does not independently determine guilt or non-compliance

Every consequential action — including account suspensions, tax assessments, or formal investigations — must be initiated by an authorized RRA officer through the proper workflow.
`,
    },

    // ── 3. Tax Compliance ─────────────────────────────────────────────────
    {
        slug: "tax-compliance-threshold",
        title: "Tax Compliance Threshold (95% Rule)",
        section: "compliance",
        summary: "A proposed 95% tax compliance threshold that would determine trader purchasing eligibility. This is a proposed policy — it has not yet been enforced. The compliance threshold is configurable by Super Admin in system settings.",
        tags: ["compliance", "threshold", "95%", "tax", "eligibility", "proposed"],
        content: `# Tax Compliance Threshold (95% Rule)

> **Policy Status:** This describes a **proposed** compliance threshold. The 95% rule is not yet enforced. It will only apply after the relevant policy has been officially approved and activated. The system configuration allows the threshold to be adjusted by Super Admin.

## Why the Threshold Was Proposed

The proposed compliance threshold addresses the challenge of traders who have outstanding tax obligations continuing to make large purchases while their tax debts remain unresolved. By linking purchasing eligibility to tax compliance, the system aims to encourage traders to settle their obligations.

## The Compliance Formula

$$\\text{Tax Compliance \\%} = \\frac{\\text{Eligible Tax Paid}}{\\text{Eligible Tax Due}} \\times 100$$

**Key terms:**
- **Eligible Tax Due** — The total tax obligations that have become due in the assessment period.
- **Eligible Tax Paid** — Verified tax payments received against those obligations.

## Practical Example

| Item | Amount |
|------|--------|
| Total tax due | 100,000 RWF |
| Total tax paid | 90,000 RWF |
| **Compliance percentage** | **90%** |

Under the proposed 95% threshold, this trader at 90% compliance would **not meet** the purchasing eligibility requirement.

A trader with 97,000 RWF paid out of 100,000 RWF due would have **97% compliance** and would meet the threshold.

## What Happens When a Trader Falls Below the Threshold

Under the proposed policy, a trader whose compliance falls below the configured threshold would:

1. Be flagged in the system for review
2. Potentially be restricted from making new purchases until their compliance is restored
3. Receive notification of their compliance status and outstanding obligations

## How Traders Can Restore Eligibility

A trader can restore their compliance status by:

1. Making verified payments against outstanding tax obligations
2. Submitting an approved payment arrangement (installment plan)
3. Successfully disputing an erroneous tax assessment
4. Having an authorized exception applied by an RRA officer

## Exceptions and Appeals

The system supports:
- **Authorized payment arrangements** — where a trader has an approved installment plan, the arrangement may count towards compliance
- **Tax assessment disputes** — a pending dispute may suspend compliance enforcement pending resolution
- **Administrative exceptions** — a Super Admin or authorized officer may apply an exception with documented justification

## Configurable Threshold

The compliance threshold is managed through TaxFlow's system configuration. Super Admin can adjust the threshold value. The current default is **95%** (0.95). Any change to the threshold is logged in the audit trail with the previous and new values.

> To view or adjust the threshold: **Super Admin → Settings → System Configuration → compliance_threshold**
`,
    },

    // ── 4. Stock Movement ─────────────────────────────────────────────────
    {
        slug: "stock-movement-rule",
        title: "Stock Movement and Sell-Through Rule",
        section: "stock-movement",
        summary: "TaxFlow uses a configurable sell-through threshold to determine whether a trader has moved sufficient stock before being eligible for new purchases. The threshold can be set globally, per product category, or per individual product.",
        tags: ["stock", "sell-through", "threshold", "eligibility", "inventory"],
        content: `# Stock Movement and Sell-Through Rule

TaxFlow implements a sell-through monitoring system to ensure traders have moved a sufficient proportion of their existing inventory before making new purchases. This helps identify traders who may be accumulating stock without recording corresponding sales.

> **Policy Note:** The original business requirement discussed a 70% stock movement threshold. The current TaxFlow implementation uses a **configurable** threshold that can be set globally, per product category, or per individual product by authorized administrators. The active threshold for any given product is determined by the most specific scope that applies.

## Why the Stock Movement Rule Exists

The rule addresses a key compliance concern: traders who purchase large quantities of goods but record few or no sales in their EBM or supply chain records. By requiring a minimum level of stock movement before new purchases are approved, the system encourages accurate reporting.

## How the Percentage is Calculated

$$\\text{Sell-Through \\%} = \\frac{\\text{Qualifying Sales Quantity}}{\\text{Available Cohort Quantity}} \\times 100$$

**Key terms:**
- **Available Cohort Quantity** — The total stock available at the start of the evaluation cycle (baseline quantity plus eligible inbound movements).
- **Qualifying Sales Quantity** — Verified sales movements (EBM sales, accepted B2B transfers) within the cycle.

## Configurable Threshold Levels

Administrators can set thresholds at three levels:

| Scope | Description | Priority |
|-------|-------------|----------|
| **Product** | Specific to one product | Highest |
| **Category** | Applies to a product category | Medium |
| **Global default** | Applies to all products | Lowest |

The system uses the most specific threshold that exists for any given product evaluation.

## Practical Example (Illustrative 75% Threshold)

| Item | Quantity |
|------|---------|
| Initial stock (baseline) | 100 bags of cement |
| Recorded eligible sales | 75 bags |
| Remaining stock | 25 bags |
| **Sell-through percentage** | **75%** |

If the active threshold for cement is 75%, this trader **meets** the requirement and would be eligible for new purchases.

If the same trader had only sold 60 bags (60% sell-through) against a 75% threshold, they would **not meet** the requirement.

## EBM Sales and Inventory Comparison

The system compares:
- **Stock inflows** — imports, production outputs, B2B receipts
- **Stock outflows** — EBM retail sales, accepted B2B dispatch sales
- **Adjustments** — documented damages, expiries, returns, corrections

Only verified and eligible stock movements are counted. Unconfirmed B2B transactions, unresolved reservations, and movements lacking evidence are excluded from the calculation.

## Damaged, Expired, Returned, and Adjusted Stock

The system accommodates:
- **Damage claims** — require documentation and admin review
- **Expiry write-offs** — documented and recorded adjustments
- **Returns** — buyer-confirmed returns adjust inventory accordingly
- **Corrections** — submitted by traders and reviewed by authorized officers

Approved adjustments affect both the available cohort quantity and the qualifying sales calculation.

## What Happens When a Trader Does Not Meet the Threshold

A trader falling below the configured threshold enters a **review required** or **blocked** state, depending on configuration. In this state:
- New purchase requests may require manual review
- An authorized officer is notified for investigation
- The trader can submit evidence to explain inventory discrepancies

> **To view active thresholds:** Super Admin → Stock Control → Thresholds
`,
    },

    // ── 5. Imports ────────────────────────────────────────────────────────
    {
        slug: "import-declaration-customs",
        title: "Import Declaration and Customs Verification",
        section: "imports",
        summary: "The complete process for importing goods into Rwanda via TaxFlow — from pre-import declaration through Customs physical inspection and verification, to recording discrepancies and updating inventory.",
        tags: ["imports", "customs", "declaration", "verification", "discrepancy"],
        content: `# Import Declaration and Customs Verification

TaxFlow manages the entire import lifecycle from pre-arrival declaration through Customs inspection and official verification. This creates an auditable record linking declared quantities to physically verified quantities.

## Before Importing — Pre-Declaration

Manufacturers, wholesalers, and retailers who intend to import goods must register their intended import in TaxFlow before or at the time of arrival. Required information includes:

| Field | Description |
|-------|-------------|
| **Product / Raw Material Name** | What is being imported |
| **Product Category** | Classification within TaxFlow's product taxonomy |
| **Declared Quantity** | The quantity stated on import documents |
| **Unit of Measurement** | Kg, litres, bags, pieces, etc. |
| **Country of Origin / Purchase** | Where the goods are coming from |
| **Supplier Information** | Supplier name and contact (where required) |
| **Expected Arrival** | Airport, border post, or entry point and expected date |
| **Supporting Documents** | Commercial invoice, packing list, certificate of origin (where applicable) |

## Customs Inspection Process

When imported goods arrive at an airport, land border, or other designated entry point, the Customs officer follows this procedure:

1. **Log in** to the Customs officer dashboard in TaxFlow.
2. **Access the import declaration** associated with the arriving shipment.
3. **Physically inspect** the imported goods at the point of entry.
4. **Compare** actual goods with the declared information (product type, quantity, packaging).
5. **Record actual quantities** as physically counted or measured.
6. **Record any discrepancies** between declared and actual quantities.
7. **Submit the verification** — approve, reject, or flag the declaration according to authorized procedures.

## Practical Example — Quantity Discrepancy

| Item | Quantity |
|------|---------|
| Declared quantity | 1,000 kg of rice |
| Customs-verified quantity | 950 kg |
| Discrepancy | 50 kg |

The system preserves both records permanently:
- **Original declared quantity:** 1,000 kg (from the trader's declaration)
- **Customs-verified quantity:** 950 kg (from the Customs officer's inspection)
- **Quantity discrepancy:** 50 kg (flagged for review)

> **Important:** Once a Customs officer submits their verified quantities, the trader cannot alter the officially verified record. Any correction requires an authorized officer's review and documented justification.

## After Customs Verification — Inventory Update

Once a Customs officer approves an import verification:

1. The verified quantity is recorded against the trader's import record.
2. The goods become part of the trader's official inventory in TaxFlow.
3. If the verified quantity differs from the declared quantity, the discrepancy is logged.
4. Significant discrepancies may trigger an AI alert or be referred for investigation.
5. Subsequent sell-through calculations use the **verified** quantity, not the declared quantity.

## Role Responsibilities

| Role | Responsibility |
|------|---------------|
| **Trader (Importer)** | Submit accurate import declarations, provide supporting documents |
| **Customs Import Officer** | Physically inspect goods, record verified quantities, submit verification |
| **Super Admin / Tax Compliance Officer** | Review flagged discrepancies, initiate investigations |
`,
    },

    // ── 6. Manufacturing ─────────────────────────────────────────────────
    {
        slug: "manufacturing-production-control",
        title: "Manufacturing and Production Control",
        section: "manufacturing",
        summary: "How TaxFlow tracks raw materials from purchase through the manufacturing process to finished goods, including production batches, conversion ratios, inventory, and sales.",
        tags: ["manufacturing", "production", "raw-materials", "inventory", "batches"],
        content: `# Manufacturing and Production Control

TaxFlow provides a complete audit trail for manufacturing businesses, tracking goods from raw material acquisition through production to finished product sales. This enables RRA to verify that production volumes are consistent with declared inputs and outputs.

## Raw Material Acquisition

Manufacturers must record all raw material inputs:

- **Local purchases** — From domestic suppliers, with purchase records and receipts
- **Imported materials** — Via the import declaration and Customs verification process
- **B2B receipts** — Raw materials received from other TaxFlow-registered businesses

Each receipt is linked to the supplier, product, quantity, and date.

## Raw Material Inventory

TaxFlow maintains a live inventory ledger for raw materials:
- Opening balance from previous period
- Additions (purchases, imports, B2B receipts)
- Reductions (used in production, damages, corrections)
- Current balance

## Production Batches

When production occurs, manufacturers declare:

| Field | Description |
|-------|-------------|
| **Input materials** | Raw materials consumed, quantities used |
| **Output products** | Finished goods produced, quantities |
| **Conversion ratio** | Expected yield from inputs to outputs |
| **Production date** | When the batch was produced |
| **Batch reference** | Internal batch or lot number |

### Example — Cement Production
A cement manufacturer uses:
- 1,000 kg of clinker (raw material)
- 200 kg of gypsum (raw material)
- Produces 1,100 kg of finished cement (allowing for processing losses)

The system records the consumption of 1,200 kg of raw materials and the addition of 1,100 kg of finished goods to inventory.

## Production Losses and Waste

Manufacturing processes typically involve some material loss. TaxFlow allows manufacturers to declare:
- **Standard production losses** — within approved tolerance ranges
- **Excess losses** — above tolerances, requiring documentation and review
- **Quality rejects** — goods that failed quality checks and cannot be sold

Production losses exceeding configured tolerance thresholds are flagged for review by an authorized Manufacturing Officer.

## Finished Goods Inventory

Finished goods are tracked in a separate inventory ledger:
- Opening balance
- Production additions
- Sales and dispatch reductions
- Returns and adjustments
- Current balance

## Finished Product Sales

Sales of finished goods are recorded via:
- **EBM retail sales** — recorded automatically from EBM-linked transactions
- **B2B dispatch** — bulk transfers to wholesalers, confirmed by buyer receipt

The system cross-references raw material consumption, finished goods production, and sales records to ensure consistency.

## Cross-Verification

The AI monitoring system can compare:
- Raw material purchases → Expected production capacity
- Declared production output → Actual raw material consumed
- Finished goods produced → Sales recorded

Significant discrepancies between these figures may trigger an AI alert for investigation.
`,
    },

    // ── 7. Supply Chain ───────────────────────────────────────────────────
    {
        slug: "supply-chain-inventory-tracking",
        title: "Supply Chain and Inventory Tracking",
        section: "supply-chain",
        summary: "How TaxFlow monitors the movement of goods through Rwanda's supply chain — from manufacturer through wholesaler to retailer — by cross-referencing seller and buyer records at each step.",
        tags: ["supply-chain", "inventory", "tracking", "b2b", "wholesaler", "retailer"],
        content: `# Supply Chain and Inventory Tracking

TaxFlow tracks the movement of goods through Rwanda's commercial supply chain, linking seller records with buyer records at each transaction point to create a complete, auditable trail from production to final sale.

## Supply Chain Structure

TaxFlow supports a multi-tier supply chain:

\`\`\`
Manufacturer → Wholesaler → Retailer → Final Consumer
\`\`\`

Each participant in the chain is a registered TaxFlow user with their own inventory and transaction records.

## What Gets Recorded at Each Step

### Manufacturer → Wholesaler Transfer
- Seller (manufacturer): records dispatch, deducts from finished goods inventory
- Product, quantity, unit price, EBM reference
- Buyer (wholesaler): confirms receipt, adds to inventory
- System links the sale record to the receipt record

### Wholesaler → Retailer Transfer
- Seller (wholesaler): records dispatch, deducts from inventory
- Product, quantity, unit price, EBM reference
- Buyer (retailer): confirms receipt, adds to inventory
- System links the sale record to the receipt record

### Retailer → Consumer
- EBM sale recorded at point of sale
- Deducts from retailer inventory
- No receipt confirmation required from individual consumers

## Cross-Referencing Mechanism

TaxFlow's power lies in its ability to cross-reference records across the chain:

**Example — Rice Distribution Check:**

| Step | Record | Quantity |
|------|--------|---------|
| Wholesaler A — Purchase from Manufacturer X | Sale record | 500 kg |
| Retailer B — Purchase from Wholesaler A | Purchase record | 500 kg |
| Retailer B — EBM sales to consumers | Sales records | 420 kg |
| Retailer B — Remaining inventory | Expected balance | 80 kg |

If Retailer B's inventory shows only 20 kg remaining (not 80 kg), and no sales, damages, or transfers explain the 60 kg difference, an AI alert may be generated.

## Information Recorded in Each B2B Transaction

- **Seller information** — TIN, business name, role
- **Buyer information** — TIN, business name, role
- **Products transferred** — Product name, category, quantity, unit
- **Transaction value** — Unit price, total value
- **EBM reference** — EBM receipt number (where applicable)
- **Transaction date** — Date of dispatch and receipt
- **Confirmation status** — Whether the buyer has confirmed receipt

## Inventory Visibility

Each registered trader's inventory is visible (with appropriate permissions) to authorized RRA officers. This allows:

- Checking whether a trader's declared inventory is consistent with their purchase history
- Identifying traders with large incoming stock but no corresponding outbound sales
- Tracing a specific product batch from manufacturer to end retailer
`,
    },

    // ── 8. TIN Verification ───────────────────────────────────────────────
    {
        slug: "tin-verification-registration",
        title: "TIN Verification and Trader Registration",
        section: "tin-verification",
        summary: "How traders register in TaxFlow, how TIN information is verified, and what happens when a TIN is invalid or cannot be verified. Includes account types and data protection principles.",
        tags: ["tin", "registration", "verification", "account", "data-protection"],
        content: `# TIN Verification and Trader Registration

TaxFlow requires all traders to have a valid Rwanda Revenue Authority (RRA) Taxpayer Identification Number (TIN) to participate in the system. TIN verification is a foundational security measure that ensures only legitimately registered businesses can record transactions.

## Why TIN Verification Matters

- Prevents unregistered businesses from accessing controlled trade channels
- Links commercial activity to official tax records
- Enables cross-referencing of EBM sales with declared inventory
- Provides a unique, stable identifier for each business entity

## Trader Registration Process

New traders register in TaxFlow by providing:
1. **TIN Number** — The unique identifier issued by RRA
2. **Business Name** — As registered with RRA
3. **Account Type** — Manufacturer, Wholesaler, or Retailer
4. **Contact Information** — Phone number, email address
5. **National ID** — Administrator's national identification

During registration, the system validates the TIN against available records to confirm the business exists. The account starts in **Pending** status until an authorized RRA officer reviews and approves it.

## Account Types

| Type | Description |
|------|-------------|
| **Manufacturer** | Produces goods from raw materials; tracks raw material inputs and finished goods outputs |
| **Wholesaler** | Purchases from manufacturers or imports; sells to retailers in bulk |
| **Retailer** | Purchases from wholesalers; sells to individual consumers |

A trader's account type determines what transactions they can record and which inventory flows are available to them.

## Account Status Lifecycle

\`\`\`
Pending → Approved → Active
                 ↓
           Under Review → Approved / Suspended
                 ↓
            Suspended → Restored
\`\`\`

| Status | Meaning |
|--------|---------|
| **Pending** | New registration awaiting RRA officer review |
| **Approved** | Account is active and can conduct transactions |
| **Under Review** | Account flagged for investigation; restricted access |
| **Suspended** | Account temporarily disabled; transactions blocked |
| **Deactivated** | Account permanently closed |

## What Happens When a TIN is Invalid

If a TIN cannot be verified:
1. The registration is flagged for review
2. The applicant is notified to provide documentation
3. An authorized officer reviews the evidence
4. The account remains in Pending status until resolved

## Data Protection

Taxpayer information in TaxFlow is protected by:
- **Role-based access control** — Only authorized officers with the appropriate permission can view sensitive trader information
- **Audit logging** — Every access to taxpayer records is logged with the officer's identity, timestamp, and action taken
- **Data minimization** — Officers see only the data their role requires
- **Secure authentication** — All staff access requires authenticated sessions

Trader data must not be shared outside TaxFlow's authorized channels. Unauthorized access or disclosure is a serious violation of data protection obligations.
`,
    },

    // ── 9. Tax and EBM ────────────────────────────────────────────────────
    {
        slug: "tax-compliance-ebm",
        title: "Tax Compliance and EBM Integration",
        section: "tax-ebm",
        summary: "How TaxFlow connects stock management, purchases, sales records, and tax compliance — including purchase reconciliation, EBM monitoring, and discrepancy identification. Note: TaxFlow does not currently have direct EBM or government system integration.",
        tags: ["tax", "ebm", "compliance", "reconciliation", "discrepancy"],
        content: `# Tax Compliance and EBM Integration

TaxFlow supports tax compliance monitoring by cross-referencing inventory records, purchase transactions, and declared sales. This section explains how reconciliation works and what systems are connected.

> **Important Disclosure:** TaxFlow currently operates as an internal RRA administrative platform. It does **not** have an active real-time integration with EBM (Electronic Billing Machine) systems or other government tax platforms at this time. References to EBM records in TaxFlow reflect data that has been entered or imported into the TaxFlow system, not automatically synchronized from EBM hardware.

## Purchase Reconciliation

TaxFlow tracks the inflow of goods for each trader:
- Import declarations (Customs-verified quantities)
- B2B receipts from other registered traders
- Production outputs (for manufacturers)

These form the **total available inventory** for the trader.

## Sales Reconciliation

Traders' outflows are tracked through:
- Declared EBM sales (entered or imported into TaxFlow)
- Confirmed B2B dispatch (transferred to and confirmed by buyer)
- Documented stock reductions (damages, write-offs, corrections)

## Inventory Reconciliation

The system calculates:
\`\`\`
Expected Remaining Inventory =
  Opening Balance
  + Purchases / Imports / Production
  - Sales / Dispatches / Adjustments
\`\`\`

If a trader's physical or declared inventory significantly differs from the expected balance, an officer can flag this for investigation.

## Tax Assessment and Payment Verification

TaxFlow records:
- Tax assessments issued against traders
- Payments received against those assessments
- Outstanding balances
- Payment arrangement approvals

The compliance threshold calculation (see [Tax Compliance Threshold](/admin/knowledge/compliance/tax-compliance-threshold)) is based on these payment records.

## Discrepancy Identification

The AI monitoring system and authorized officers can identify discrepancies such as:
- Trader with large inventory purchases but minimal recorded sales
- Trader with EBM sales quantities exceeding their declared inventory (potential ghost sales)
- Tax payments significantly below assessed amounts for extended periods

Identified discrepancies are referred to the appropriate officer role for investigation through the case management system.

## Outstanding Tax Obligations

The system tracks and displays:
- Current tax due
- Payments received
- Outstanding balance
- Payment history
- Assessment details

Authorized Tax Compliance Officers and Payment Reconciliation Officers can access these records for the traders within their authorization scope.
`,
    },

    // ── 10. Roles ─────────────────────────────────────────────────────────
    {
        slug: "administrative-roles-responsibilities",
        title: "Administrative Roles and Responsibilities",
        section: "roles",
        summary: "A complete reference guide to every administrative role in TaxFlow — what each role can see, what actions they can take, and their responsibilities within the system.",
        tags: ["roles", "rbac", "permissions", "responsibilities", "staff"],
        content: `# Administrative Roles and Responsibilities

TaxFlow uses Role-Based Access Control (RBAC) to ensure each administrator sees only the information and tools relevant to their responsibilities. This page describes each role and its authorized capabilities.

> Permissions are enforced server-side on every request. No client-supplied role claim is trusted. Super Admin does not automatically bypass all restrictions — access is always determined by the specific permission set assigned to each role.

## Super Administrator

The highest-level administrative role with the broadest access.

**Responsibilities:**
- Complete system oversight and configuration
- Staff account creation, role assignment, and management
- Trader account approval, rejection, suspension, and restoration
- System policy configuration (compliance threshold, VAT rate, etc.)
- Knowledge Center content management
- Audit history review
- System health monitoring

**Key Permissions:** Staff management, system configuration, all trade operations, all tax and payment functions, AI tools, audit trail, security center.

---

## RRA Director / Executive

Senior oversight role for strategic monitoring.

**Responsibilities:**
- Executive dashboard and high-level analytics
- Supply chain summary review
- Strategic reporting

**Key Permissions:** Executive dashboard, aggregate reports, supply chain summary, AI assistant.

---

## Tax Compliance Officer

Frontline officer responsible for trader compliance monitoring.

**Responsibilities:**
- Taxpayer intelligence search and monitoring
- Tax compliance review and follow-up
- Payment verification
- Support ticket management
- Taxpayer correction management (assigned cases)
- Trader registration support

**Key Permissions:** Taxpayer search, account management, compliance records, tax records, payment review, support management, AI assistant.

---

## Tax Auditor

Specialist in detailed audit investigations.

**Responsibilities:**
- Taxpayer audit and investigation
- Transaction review
- Audit trail analysis
- Supply chain tracing

**Key Permissions:** Taxpayer search, compliance records, tax records, transaction records, audit trail, traceability, supply chain summary, AI assistant.

---

## Revenue Investigator

Investigates potential tax evasion and significant compliance failures.

**Responsibilities:**
- In-depth taxpayer investigations
- Case management
- Production formula review
- Supply chain tracing

**Key Permissions:** Taxpayer search, case management, transaction records, audit trail, production formula, supply chain summary, AI assistant.

---

## Taxpayer Support Officer

Handles trader-facing support communications.

**Responsibilities:**
- Support ticket management
- Staff communications

**Key Permissions:** Support management, staff communications.

---

## Taxpayer Registration Officer

Processes new trader registrations.

**Responsibilities:**
- Reviewing and processing new trader registrations
- TIN verification

**Key Permissions:** Trader registration creation.

---

## Product Traceability Officer

Monitors stock movements and product journeys through the supply chain.

**Responsibilities:**
- Taxpayer account monitoring
- Stock level review
- Product traceability

**Key Permissions:** Taxpayer search, traceability records, stock read, AI assistant.

---

## Customs & Import Officer

Verifies imported goods at points of entry.

**Responsibilities:**
- Reviewing import declarations
- Physically inspecting and verifying imported goods
- Recording actual quantities and discrepancies
- Manufacturing material receipt review

**Key Permissions:** Taxpayer search, import records, import review/verification, material receipt review, AI assistant.

---

## Tax Payments & Reconciliation Officer

Manages tax payment processing and reconciliation.

**Responsibilities:**
- Payment verification and reconciliation
- Collection account management
- Outstanding balance review

**Key Permissions:** Taxpayer search, tax records, payments, payment reconciliation, collection accounts, AI assistant.

---

## Data & AI Intelligence Analyst

Specialist in data analysis and AI-generated intelligence.

**Responsibilities:**
- AI alert and finding review
- Data quality monitoring
- Analytics and reporting
- AI feedback review

**Key Permissions:** Taxpayer search, analytics, AI findings, data quality, aggregate reports, AI assistant and feedback.

---

## Stock Control Administrator

Manages stock threshold policies and sell-through enforcement.

**Responsibilities:**
- Stock threshold management (scoped)
- Restock request review
- Material accounting review

**Key Permissions:** Stock threshold (read + manage scoped), restock management, material receipt review, production batch review, material adjustments.
`,
    },

    // ── 11. Account Management ────────────────────────────────────────────
    {
        slug: "account-management-enforcement",
        title: "Account Management and Enforcement",
        section: "account-management",
        summary: "How trader accounts are managed in TaxFlow — approval, rejection, review, suspension, restoration, and deactivation — with full audit trail requirements for every sensitive action.",
        tags: ["account", "suspension", "approval", "enforcement", "audit-trail"],
        content: `# Account Management and Enforcement

TaxFlow provides authorized RRA officers with structured account management capabilities. Every significant account action is recorded in the audit trail with complete accountability information.

## Account Status Overview

| Status | Description | Can Trade? |
|--------|-------------|-----------|
| **Pending** | New registration awaiting review | No |
| **Approved** | Active and in good standing | Yes |
| **Under Review** | Flagged for investigation | Limited |
| **Suspended** | Temporarily disabled | No |
| **Deactivated** | Permanently closed | No |

## Account Actions

### Approving a New Account
When a trader registers, an authorized officer reviews their TIN, business details, and supporting documents. If satisfied, they approve the account, allowing the trader to begin recording transactions.

### Rejecting a Registration
If a registration cannot be verified or contains incorrect information, the officer rejects it with a documented reason. The trader is notified and may reapply with corrections.

### Placing Under Review
An officer may place an account under review pending investigation. The trader receives a notification but specific investigation details are not disclosed while the review is active.

### Suspending an Account
Account suspension is a formal action that blocks the trader from conducting transactions. Suspension requires:
- A documented reason
- An authorized officer's decision
- Notification to the trader (where appropriate)
- Full audit log entry

Suspension is a temporary measure — the account can be restored when the issue is resolved.

### Restoring a Suspended Account
When the reason for suspension has been resolved (payment made, investigation concluded, compliance restored), an authorized officer can restore the account to active status.

### Deactivating an Account
Permanent deactivation closes the account. This is typically used when a business has ceased operations or the TIN has been cancelled. Deactivation requires documented justification.

## Audit Trail Requirements

Every sensitive account action must generate an audit record containing:

| Field | Description |
|-------|-------------|
| **Administrator** | The officer who performed the action (linked to their staff account) |
| **Action** | The specific action taken (APPROVED, SUSPENDED, RESTORED, etc.) |
| **Reason** | A documented reason explaining why the action was taken |
| **Date and Time** | Precise timestamp of the action |
| **Account** | The trader account affected (TIN, business name) |
| **Previous State** | The account status before the action |
| **New State** | The account status after the action |

This audit trail is immutable — records cannot be deleted or altered after creation.

## Officer Responsibilities

Authorized officers must:
- Apply account actions only when there is documented justification
- Use the minimum necessary restriction (review before suspension, suspension before deactivation)
- Document reasons accurately and completely
- Notify traders according to applicable procedures
- Never take account action based solely on an AI alert without human review of the evidence
`,
    },

    // ── 12. Security ──────────────────────────────────────────────────────
    {
        slug: "security-audit-trail",
        title: "System Policies, Security and Audit Trail",
        section: "security",
        summary: "TaxFlow's security model — role-based access control, secure authentication, audit logging, data integrity, and accountability principles that protect taxpayer information and system integrity.",
        tags: ["security", "rbac", "audit", "authentication", "data-protection", "integrity"],
        content: `# System Policies, Security and Audit Trail

TaxFlow is designed with security and accountability at its core. This section explains how the system protects taxpayer information, enforces access control, and maintains an auditable history of all significant actions.

## Role-Based Access Control (RBAC)

Access to TaxFlow's features and data is governed by a strict RBAC system:

- **Every permission is explicit** — no role has implicit access to all features
- **Permissions are enforced server-side** — no client-supplied role claim or parameter is trusted
- **Super Admin is not an all-bypass** — even Super Admin has specific, defined permissions
- **Multiple roles** — a staff member can hold multiple roles, each adding their respective permissions
- **Legacy role support** — older role types are retained for existing staff during migration

Permissions control access to:
- Pages and navigation items in the sidebar
- Server actions and API endpoints
- Specific data fields returned in queries
- Administrative functions (approve, suspend, etc.)

## Secure Authentication

TaxFlow uses Better Auth for session management:
- All sessions are server-validated on every request
- Session tokens are httpOnly cookies, not accessible to client scripts
- Staff accounts require verified credentials
- Failed authentication attempts are rate-limited

## Audit Logging

Every significant action in TaxFlow generates an immutable audit log entry. Logged events include:

- Staff sign-in and sign-out
- Trader account approvals, rejections, suspensions, and restorations
- System configuration changes
- AI query usage
- Knowledge Center content changes
- Tax assessment and payment actions
- Import verification decisions
- Case management actions

Each audit entry records:
- **Who** performed the action (staff user ID, name)
- **What** action was performed (action type code)
- **When** it occurred (precise timestamp)
- **Target** of the action (trader account, configuration key, etc.)
- **Metadata** relevant to the specific action

Audit records cannot be deleted or modified after creation.

## Data Integrity

TaxFlow protects the integrity of its data through:

- **Immutable records** — Once created, audit logs, Customs verification records, and similar records cannot be altered
- **Transaction safety** — Database operations use transactions to prevent partial updates
- **Validation** — All inputs are validated server-side regardless of client-side checks
- **Idempotency** — Critical operations are protected against duplicate submissions

## Data Protection Principles

Taxpayer information in TaxFlow is treated as sensitive data:

- Only authorized officers with specific permissions can access trader data
- Data is accessed on a need-to-know basis aligned with role responsibilities
- Access to taxpayer records is logged in the audit trail
- Sensitive information (tax amounts, compliance status) is restricted to officers with explicit data access permissions
- Production formula information (for manufacturers) has additional confidentiality protections

## Accountability

The TaxFlow system is designed to maintain clear accountability:

- Every consequential action is attributed to a specific staff member
- AI recommendations always require human authorization before action is taken
- Administrative decisions are documented with reasons
- The audit trail provides a complete history for investigation and review purposes

> Unauthorized access to TaxFlow, unauthorized disclosure of taxpayer information, or manipulation of system records may constitute a serious violation of applicable laws and RRA policies.
`,
    },
];
