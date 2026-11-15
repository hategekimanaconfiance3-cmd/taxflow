// ---------------------------------------------------------------------------
// Default Knowledge Center article content — Comprehensive Edition
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
        title: "What is TaxFlow? — Complete Overview",
        section: "about",
        summary: "TaxFlow is Rwanda's National Trade and Tax Control System — a digital platform connecting manufacturers, wholesalers, retailers, Customs officers, and RRA administrators to improve tax compliance, supply chain traceability, and revenue integrity.",
        tags: ["taxflow", "overview", "rwanda", "rra", "objectives", "supply-chain"],
        content: `# What is TaxFlow? — Complete Overview

## 1. Overview

TaxFlow is a digital tax administration and supply-chain intelligence platform developed to improve transparency, accountability, tax compliance, production traceability, and revenue collection in Rwanda.

The platform connects every significant participant in the national commercial chain — from raw-material suppliers and manufacturers through wholesalers, distributors, retailers, and final customers — with Rwanda Revenue Authority (RRA) administrators, Customs officers, and compliance personnel.

TaxFlow is not a replacement for existing tax law, existing tax systems, or existing customs procedures. It is a monitoring and coordination system designed to give authorized RRA officers better information, earlier visibility into irregularities, and a structured workflow for investigation and intervention.

---

## 2. The Problem TaxFlow Addresses

Traditional tax monitoring faces a structural challenge: it is difficult to establish whether all products manufactured, imported, distributed, purchased, and sold have been properly recorded.

### A Practical Illustration

A manufacturer produces 1,000 litres of cooking oil. The official production declaration records 1,000 litres. However, the manufacturer ships only 800 litres through documented channels and allows the remaining 200 litres to enter distribution informally — without invoices, EBM records, or stock movement entries.

Those 200 litres may subsequently:
- Be sold by wholesalers who do not record the purchase source.
- Appear in retail inventories without matching purchase records.
- Be sold to final customers without EBM transactions.
- Generate no VAT, no income tax, and no supply chain records.

Multiply this pattern across thousands of products and businesses and the cumulative revenue impact becomes substantial.

TaxFlow aims to close this gap by creating a connected record of economic activities throughout the supply chain.

---

## 3. The Complete Supply Chain Journey

TaxFlow tracks products through the following stages:

### Stage 1 — Raw Materials and Manufacturing Inputs
Manufacturers declare the raw materials they intend to use in production. These declarations can include imported materials (linked to Customs clearance records) and domestically purchased inputs.

### Stage 2 — Manufacturing and Production Registration
Before production begins, the manufacturer registers a production plan: product to be made, planned quantities, materials to be consumed, and production period.

### Stage 3 — Finished Goods Stock Creation
When production is completed, the manufacturer declares actual output. TaxFlow compares actual output against planned output and flags significant deviations for review.

### Stage 4 — Product Dispatch from Manufacturers
The manufacturer records each dispatch of finished goods to buyers. Each dispatch creates a corresponding inventory reduction on the manufacturer's side.

### Stage 5 — Wholesaler Receipt and Inventory
The receiving wholesaler confirms receipt of goods. TaxFlow records the agreed accepted quantity and creates the corresponding inventory entry. Disputed or damaged quantities are tracked separately.

### Stage 6 — Distributor Transactions
Distributors record purchases and onward sales. Every movement creates linked records connecting the original manufacture to current ownership.

### Stage 7 — Retailer Inventory and Sales
Retailers record their stock from suppliers. EBM sales records (where integrated) provide evidence of products sold to final customers.

### Stage 8 — Final Customer Purchases
In integrated scenarios, EBM receipts connect customer purchases back to the retail inventory record.

### Stage 9 — Tax Records, Reconciliation, and Compliance Monitoring
Authorized officers can compare purchase records, sales records, inventory levels, and EBM data to identify gaps. AI monitoring analyzes patterns across the full chain.

---

## 4. Supply Chain Diagram

~~~
[Raw Material Supplier]
        ↓ Purchase / Import
[Manufacturer]
   • Production Plan Registration
   • Actual Output Declaration
   • Finished Goods Inventory
        ↓ Dispatch (B2B Transaction)
[Wholesaler / Importer]
   • Receipt Confirmation
   • Available Inventory
        ↓ Distribution
[Distributor]
   • Purchase Record
   • Onward Sales
        ↓ Purchase
[Retailer]
   • Stock from Suppliers
   • EBM Retail Sales
        ↓ Purchase
[Final Customer]
   • EBM Receipt (where integrated)
        ↑ All stages monitored by RRA via TaxFlow
~~~

---

## 5. TaxFlow Objectives

| Objective | What It Means in Practice |
|-----------|--------------------------|
| **Increase tax transparency** | Every significant stock movement creates an auditable record |
| **Reduce unrecorded economic activities** | Products entering distribution without official records are detected earlier |
| **Improve stock accountability** | Opening stock, purchases, sales, and closing stock must reconcile |
| **Strengthen VAT compliance** | Purchase and sales records support VAT reconciliation |
| **Improve manufacturing traceability** | Input materials and output quantities are recorded and compared |
| **Support evidence-based tax investigations** | Officers have documented records to support formal case-building |
| **Detect suspicious activities earlier** | AI monitoring identifies unusual patterns before they escalate |
| **Improve administrative efficiency** | Officers receive prioritized alerts rather than reviewing all transactions manually |
| **Protect legitimate businesses** | Well-documented businesses can demonstrate compliance when needed |

---

## 6. How TaxFlow Connects Stakeholders

| Stakeholder | What TaxFlow Gives Them | What TaxFlow Requires from Them |
|-------------|------------------------|--------------------------------|
| **Manufacturers** | Production tracking, compliance visibility | Accurate production declarations, material registrations |
| **Importers / Wholesalers** | Import declaration management, inventory records | Accurate import declarations, receipt confirmations |
| **Retailers** | Inventory management, purchasing eligibility status | Stock records, EBM integration (where available) |
| **Customs Officers** | Structured declaration review, discrepancy recording | Physical inspection records, accurate quantity verification |
| **Tax Compliance Officers** | Trader compliance status, anomaly alerts | Case investigation, formal findings |
| **AI/Risk Analysts** | AI-generated alert queue, evidence summaries | Alert review, human decisions on escalation |
| **Super Administrators** | Full system configuration and oversight | Accurate role management, audit of admin actions |

---

## 7. What TaxFlow Does Not Do

Understanding TaxFlow's boundaries is as important as understanding its capabilities:

- TaxFlow does not automatically determine tax fraud. It identifies patterns that may warrant investigation.
- TaxFlow does not replace the Rwanda Revenue Authority's formal tax assessment procedures.
- TaxFlow does not independently cancel TINs or impose penalties. These require formal authorized processes.
- TaxFlow does not currently have direct real-time integration with EBM systems. EBM data, where available, is imported through authorized integration processes.
- TaxFlow does not access RRA's internal tax ledgers directly unless a specific authorized integration has been established.

---

## 8. Frequently Asked Questions

**Q: Who uses TaxFlow?**
A: Authorized RRA administrators, compliance officers, Customs officers, manufacturing monitoring officers, stock administrators, and other designated RRA personnel. Traders interact with TaxFlow through their business accounts to submit declarations and confirm transactions.

**Q: Is TaxFlow replacing existing RRA systems?**
A: No. TaxFlow adds a monitoring and coordination layer. Existing tax assessment, collection, and legal processes continue through their established channels.

**Q: What is the status of EBM integration?**
A: EBM integration is a planned capability. The current system uses manually submitted sales records and B2B transaction confirmations. Full EBM integration will be announced separately when available.

**Q: Can a trader be penalized based solely on a TaxFlow AI alert?**
A: No. AI alerts are for officer review only. All formal actions require human authorization through proper procedures.

---

## 9. Related Knowledge Center Topics

- AI-Powered Monitoring — how the system detects unusual patterns
- Manufacturing and Production — production traceability in detail
- Supply Chain and Inventory — how goods flow between businesses
- Tax Compliance and EBM — reconciliation and compliance monitoring
- Administrative Roles — who does what within TaxFlow
`,
    },

    // ── 2. AI Monitoring ─────────────────────────────────────────────────
    {
        slug: "ai-powered-monitoring",
        title: "AI-Powered Monitoring — Complete Guide",
        section: "ai-monitoring",
        summary: "TaxFlow's AI monitoring system continuously analyzes recorded commercial activities to identify unusual patterns, generate risk alerts, and support authorized RRA officer investigations. AI is a decision-support tool — it never automatically accuses, suspends, or penalizes businesses.",
        tags: ["ai", "anomaly-detection", "risk", "monitoring", "alerts", "investigation"],
        content: `# AI-Powered Monitoring — Complete Guide

## 1. Overview

TaxFlow includes an AI-powered monitoring system that continuously analyzes recorded commercial activities across manufacturers, importers, wholesalers, distributors, and retailers.

The system searches for unusual patterns, inconsistencies, and potential irregularities. When something warrants attention, it generates a structured alert and routes it to the appropriate authorized RRA officer for review.

> **Critical principle:** AI monitoring is a decision-support tool. It identifies patterns that may warrant investigation. It does not establish guilt, determine tax liability, or authorize administrative action. Every consequential action requires a human officer's review and authorized decision.

---

## 2. Purpose and Objectives

The AI monitoring system exists because:

- Manual review of all commercial transactions across thousands of businesses is not operationally feasible.
- Unusual patterns may become significant compliance issues if not detected early.
- Officers need a prioritized queue of potential concerns rather than unstructured data.
- Evidence must be systematically collected and preserved for investigation.

**Specific objectives:**
- Detect unusual stock movements, production results, and transaction patterns.
- Prioritize officer attention on the highest-risk activities.
- Create structured, documented evidence for any subsequent investigation.
- Reduce the possibility of irregularities persisting undetected.
- Support fair treatment by ensuring all businesses are assessed against the same analytical standards.

---

## 3. What the AI Monitors

The AI system analyzes the following categories of recorded activity:

### Manufacturing Records
- Production plans and registered material inputs
- Actual material consumption versus planned consumption
- Actual finished-goods output versus planned output
- Production batch changes and cancellations
- Historical production efficiency patterns
- Changes in production formulas or process registrations

### Inventory Records
- Opening stock levels
- Inbound stock movements (imports, production outputs, B2B receipts)
- Outbound stock movements (retail sales, B2B dispatches)
- Manual stock adjustments
- Damage claims and write-offs
- Closing stock levels and reconciliation gaps

### Transaction Records
- B2B purchase and sales transactions
- Buyer receipt confirmations
- Disputed and rejected quantities
- Unusual transaction volumes relative to business history
- Transactions between related businesses

### Import and Customs Records
- Declared import quantities
- Customs-verified quantities
- Quantity discrepancies between declarations and inspections
- Repeated discrepancy patterns
- Products appearing in domestic inventory without import or production evidence

### Compliance Records
- Tax payment histories
- Outstanding obligation patterns
- EBM transaction records where integrated
- Reconciliation gaps between purchases, sales, and tax declarations

### Account and Administrative Activities
- Unusual account access patterns
- Repeated failed authentication attempts
- Bulk administrative changes
- Configuration changes affecting monitoring parameters

---

## 4. The Monitoring Lifecycle

Understanding how monitoring works step by step:

**Step 1 — Activity Recording**
A business records an activity: a production declaration, a stock receipt, a sale, an import.

**Step 2 — Data Storage and Evidence Preservation**
TaxFlow stores the activity with all supporting details: timestamps, quantities, actors, referenced documents.

**Step 3 — Pattern Evaluation**
The monitoring engine evaluates the recorded activity against:
- The business's own historical patterns for this type of activity
- Expected ranges based on declared plans
- Approved tolerance ranges for the product and business type
- Cross-business patterns for similar activities

**Step 4 — Signal Generation**
If a significant deviation is detected, the system generates a structured risk signal containing the specific evidence.

**Step 5 — Risk Classification**
The signal is classified by severity: Informational, Low, Medium, High, or Critical.

**Step 6 — Officer Assignment**
The system identifies the appropriate department or officer based on the finding type and business category.

**Step 7 — Notification**
The assigned officer receives a structured notification with the alert details, evidence summary, and recommended next steps.

**Step 8 — Officer Review**
The officer reviews the evidence, may request additional information, and decides on appropriate action.

**Step 9 — Case Documentation**
The officer records their findings, the action taken, and the reason. The record is preserved for audit.

**Step 10 — Resolution and Follow-up**
The case is closed with documented outcome, or escalated if further investigation is needed.

---

## 5. AI Risk Classification

| Level | Description | Typical Officer Response |
|-------|-------------|------------------------|
| **Informational** | Minor anomaly, likely explainable; no immediate action needed | Monitor; note in business file |
| **Low** | Small deviation from baseline; may have a simple explanation | Review records; request clarification if needed |
| **Medium** | Moderate deviation; warrants closer examination of records | Open a review case; examine supporting evidence |
| **High** | Significant anomaly; formal review required | Open an investigation case; request business clarification |
| **Critical** | Severe anomaly indicating possible systematic irregularity | Escalate immediately; notify senior officers |

Risk scores are prioritization tools. A Critical alert does not mean fraud has been confirmed. A Low alert does not mean the activity is acceptable. Human judgment informed by all available evidence must guide every decision.

---

## 6. Example Alert Scenarios

### Example A — Manufacturing Output Discrepancy

**Situation:** A manufacturer regularly produces approximately 1,000 litres of cooking oil per batch using approximately 850 kg of raw materials.

**Detected activity:** In the latest batch, the manufacturer used 851 kg of raw materials but declared only 102 litres of output.

**What AI detects:** A dramatic reduction in production efficiency — from approximately 1.18 litres per kg of material to approximately 0.12 litres per kg.

**AI response:** Generate a High or Critical alert documenting:
- Previous production efficiency history
- Current declared quantities
- The calculated deviation from established patterns
- Reference to the specific production batch

**Officer action expected:** Review the production declaration and supporting evidence. Contact the business for clarification. Assess whether a legitimate explanation exists (equipment failure, spoilage, formula change). Document findings.

**What AI must not do:** Automatically classify the production as fraudulent or restrict the business without human review.

---

### Example B — Inventory Reconciliation Gap

**Situation:** A wholesaler receives 500 bags of rice (confirmed by receipt record). Over the following month, the wholesaler records sales of 300 bags. No damage claims, returns, or transfers are recorded.

**Detected activity:** At month end, the recorded closing inventory shows 150 bags, not the expected 200 bags.

**What AI detects:** A 50-bag unexplained inventory gap. The stock received (500) minus recorded sales (300) should leave 200 bags. The declared closing stock is 150 bags — 50 bags unaccounted for.

**AI response:** Generate a Medium or High alert documenting the specific quantities, timeline, and the unexplained gap.

**Officer action expected:** Review the transaction history. Determine if any missing records (unreported sales, unreported transfers) explain the gap. Request supporting documentation.

---

### Example C — Repeated Import Discrepancies

**Situation:** A trader has submitted five import declarations over six months. In four of them, the Customs-verified quantity was significantly lower than the declared quantity.

**What AI detects:** A pattern of repeated discrepancies between declared and verified import quantities. Single discrepancies may be explainable; a persistent pattern suggests a systemic issue.

**AI response:** Generate a High alert with:
- Timeline of all five declarations
- Declared versus verified quantities for each
- Pattern analysis showing the frequency of discrepancy
- Recommendation to open a formal review

---

### Example D — Unusual Stock Adjustment Pattern

**Situation:** A retailer submits 12 manual stock adjustments in a single month, mostly reducing inventory, without supporting damage documentation.

**What AI detects:** An unusual frequency of downward adjustments that could indicate unrecorded sales or stock manipulation.

**AI response:** Generate a Medium alert flagging the adjustment pattern for review.

---

## 7. What Officers Can Do with an Alert

An authorized officer who receives an AI alert can:

| Action | Description |
|--------|-------------|
| **Open the alert** | View the full evidence summary, historical data, and detected deviation |
| **Review transaction history** | Examine the specific transactions that triggered the alert |
| **Request clarification** | Contact the business through authorized channels |
| **Assign the alert** | Delegate to a more appropriate officer or department |
| **Open an investigation case** | Escalate to a formal investigation with dedicated case management |
| **Record findings** | Document what was reviewed, what was found, and the conclusion |
| **Recommend action** | Propose a specific administrative action with documented justification |
| **Escalate** | Forward to senior officers or another department |
| **Close with explanation** | Mark the alert resolved with a documented explanation of why no action was needed |

---

## 8. What Officers Must Not Do

- Take consequential action (account suspension, tax assessment referral) based solely on an AI alert without reviewing supporting evidence.
- Share alert content with unauthorized personnel.
- Use alert information to target a business without following the proper investigation workflow.
- Modify or delete alert evidence.
- Close alerts without documentation.

---

## 9. AI Alert Accountability Record

Every AI alert must be traceable. The system preserves:

| Field | Purpose |
|-------|---------|
| Alert reference | Unique identifier for the alert |
| Business identifier | TIN and business name |
| Activity being evaluated | The specific event or pattern |
| Detection timestamp | When the alert was generated |
| Rule or model | Which monitoring logic triggered the alert |
| Evidence references | The specific records used as evidence |
| Risk classification | Severity level and reasoning |
| Assigned officer | Who is responsible for review |
| Review history | All officer actions on this alert |
| Final disposition | The documented outcome |

This record is preserved as part of the system audit trail and cannot be altered after creation.

---

## 10. Common Questions

**Q: Can AI monitoring see my manufacturing formula?**
A: No. Standard monitoring uses protected identifiers, not material names. Only officers with specific confidential-recipe permission can access formula details, and that access is separately logged.

**Q: What if the AI alert is based on a data error?**
A: The officer reviewing the alert should document the error and close the alert with an explanation. Businesses may also submit correction requests through the authorized channel.

**Q: How often does the monitoring engine run?**
A: The system is designed for continuous monitoring triggered by recorded activities, not periodic batch reports. Alerts are generated close to the time of the activity being evaluated.

**Q: Who receives Critical alerts?**
A: Critical alerts are routed to the authorized officer for the relevant business type and also notified to Super Admin and senior officers where configured.

---

## 11. Related Knowledge Center Topics

- About TaxFlow — why continuous monitoring matters
- Manufacturing and Production — manufacturing-specific AI monitoring
- Stock Movement Rule — inventory monitoring and sell-through analysis
- Supply Chain and Inventory — supply-chain discrepancy detection
- Administrative Roles — which officers handle which alert types
`,
    },

    // ── 3. Tax Compliance ─────────────────────────────────────────────────
    {
        slug: "tax-compliance-threshold",
        title: "Tax Compliance Threshold — Configurable Stock-Control Proposal",
        section: "compliance",
        summary: "The 95% compliance threshold is a configurable TaxFlow stock-control proposal designed to link purchasing eligibility to sell-through performance. It is NOT an officially approved statutory tax requirement. The threshold is adjustable by authorized administrators.",
        tags: ["compliance", "threshold", "95%", "sell-through", "eligibility", "proposed", "stock-control"],
        content: `# Tax Compliance Threshold — Configurable Stock-Control Proposal

## 1. Overview

TaxFlow includes a configurable compliance threshold that connects a trader's purchasing eligibility to their recorded sell-through performance. The current default value is **95%**.

> **Policy Status — Read Carefully:** The 95% threshold is a **configurable TaxFlow stock-control proposal**. It has NOT been enacted as an officially approved statutory tax requirement. It must not be described or applied as legally mandated compliance without separate, formal policy authorization. It is a system-level control that encourages accurate inventory recording and can be adjusted by authorized Super Administrators based on approved business and tax policies.

---

## 2. Purpose and Objectives

The threshold is designed to:

- **Encourage accurate sales recording** — traders who record their sales honestly will naturally meet the threshold before needing to restock.
- **Identify stock accumulation without sales records** — a trader who accumulates large inventory but records few sales will be identified for review.
- **Link inventory management to compliance** — connecting purchasing eligibility to sell-through creates a practical incentive for complete record-keeping.
- **Support evidence-based monitoring** — the system generates documentation that officers can use if formal investigation becomes necessary.

The threshold applies at the **product level** — it evaluates whether a trader has sold sufficient quantities of a specific product before becoming eligible for a new purchase of that same product.

---

## 3. How the Threshold Works — Step by Step

### Step 1 — Stock Received
A trader receives stock of a specific product. The system records this as an inbound stock event with the confirmed quantity.

**Example:** A cement retailer confirms receipt of 100 bags of Portland Cement.

### Step 2 — Sales Recording
As the trader sells product, each sale is recorded. Eligible sales include:
- EBM retail sales (where integrated)
- Confirmed B2B dispatch-and-receipt transactions to downstream buyers

### Step 3 — Sell-Through Calculation
When the trader requests a new purchase of the same product, the system calculates:

**Sell-Through % = (Recorded Eligible Sales ÷ Available Stock Received) × 100**

**Example calculation:**
- Available stock received: 100 bags
- Recorded eligible sales: 50 bags
- Sell-through percentage: 50%
- Configured threshold: 95%
- Result: Trader does NOT yet meet the threshold

### Step 4 — Eligibility Assessment
- If sell-through % ≥ configured threshold → trader is eligible for new purchase
- If sell-through % < configured threshold → new purchase requires review or is restricted

### Step 5 — When Threshold is Met
When recorded eligible sales reach 95 bags out of 100:
- Sell-through: 95%
- Status: Threshold met
- Trader becomes eligible for new purchase of this product

---

## 4. The Sell-Through Calculation in Detail

### What Counts as Eligible Stock Received

| Included | Excluded |
|---------|---------|
| Confirmed B2B receipts (buyer confirmed) | Unconfirmed or disputed receipts |
| Import clearance records (Customs verified) | Imports pending verification |
| Production output (manufacturer's own product) | Unvalidated production claims |
| Authorized opening stock adjustments | Disputed adjustments under review |

### What Counts as Eligible Sales

| Included | Excluded |
|---------|---------|
| EBM-recorded retail sales (where integrated) | Unverified cash sales without records |
| Confirmed B2B dispatch-and-receipt transactions | Dispatches without buyer receipt confirmation |
| Authorized returns to supplier (stock reduction) | Disputed returns under review |
| Documented damage write-offs (after approval) | Unapproved damage claims |

### Handling Special Cases

**Returns from customers:** When a customer returns product, the returned quantity is added back to available stock, reducing the sell-through percentage accordingly.

**Damaged goods:** Properly documented damage claims, once approved by an authorized officer, reduce the available stock denominator, potentially improving the sell-through percentage.

**Stock transfers between locations:** Transfers to other registered locations of the same business may or may not count as eligible sales depending on configuration.

**Expired stock:** Documented expiry write-offs, once approved, reduce available stock similar to damage claims.

---

## 5. Numerical Examples

### Example 1 — Threshold Met

| Item | Quantity |
|------|---------|
| Opening stock | 0 bags |
| Stock received (confirmed) | 100 bags |
| Eligible sales recorded | 97 bags |
| Approved damage write-off | 2 bags |
| Effective available stock | 98 bags |
| Effective sell-through | 97 ÷ 98 = **99%** |
| Configured threshold | 95% |
| **Eligibility status** | **ELIGIBLE — threshold met** |

### Example 2 — Threshold Not Met

| Item | Quantity |
|------|---------|
| Opening stock | 10 bags |
| Stock received (confirmed) | 90 bags |
| Total available | 100 bags |
| Eligible sales recorded | 60 bags |
| Sell-through percentage | 60 ÷ 100 = **60%** |
| Configured threshold | 95% |
| **Eligibility status** | **NOT ELIGIBLE — 35% below threshold** |

---

## 6. Configurable Threshold — Administration

### Who Can Change the Threshold

| Role | Can Change Global Threshold | Can Change Category Threshold | Can Change Product Threshold |
|------|-----------------------------|-------------------------------|------------------------------|
| Super Administrator | Yes | Yes | Yes |
| Stock Administrator | No | Depends on configuration | Depends on configuration |
| Compliance Officer | No | No | No |

### How to Adjust the Threshold
Authorized administrators access threshold settings through the system configuration panel. Changes require:
1. Logging in with Super Admin or authorized Stock Admin credentials
2. Navigating to system configuration
3. Selecting the relevant scope (global, category, or product)
4. Entering the new threshold value
5. Providing a documented reason for the change
6. Confirming the change

### Audit of Threshold Changes
Every threshold change is recorded in the audit trail with:
- Previous value
- New value
- Administrator who made the change
- Reason provided
- Timestamp

### Effective Dates
When a threshold is changed, the new value applies to future eligibility assessments. Historical assessments are not retroactively recalculated.

---

## 7. What Happens When a Trader Is Below Threshold

If a trader's sell-through for a specific product falls below the configured threshold:

1. The system flags the product as requiring review before a new purchase.
2. An authorized officer may review the case.
3. The officer can:
   - Approve an exception with documented justification
   - Request clarification from the trader
   - Confirm the restriction pending compliance improvement
4. The trader can improve their status by:
   - Recording additional eligible sales
   - Submitting documentation for approved adjustments (damage, expiry, returns)
   - Requesting an officer review if the data is incorrect

---

## 8. Important Safeguards

The threshold system includes safeguards to prevent incorrect application:

- **Data accuracy dependency:** The threshold is only as reliable as the underlying data. Incorrect inventory records can produce misleading results.
- **Officer review for borderline cases:** Cases near the threshold boundary are flagged for officer review rather than automatically blocked.
- **Exception process:** Authorized exceptions with documented justification are always available.
- **Appeal pathway:** Traders may submit correction requests if they believe their sell-through data is incorrect.
- **Transparency:** Traders can see their sell-through status through their account.

---

## 9. Frequently Asked Questions

**Q: Is the 95% threshold a legal requirement?**
A: No. It is a configurable TaxFlow stock-control proposal. It will only have legal effect if separately enacted through proper policy authorization.

**Q: Can the threshold be different for different products?**
A: Yes. The threshold can be set at the global level, category level, or individual product level. The most specific applicable threshold takes effect.

**Q: What if a trader's inventory data is wrong?**
A: The trader should submit a correction request. An authorized officer reviews the correction and approves or rejects it with documentation. Approved corrections update the sell-through calculation.

**Q: Does an approved payment arrangement count?**
A: The compliance threshold is a sell-through (stock movement) threshold, not a tax payment threshold. Tax payment compliance is tracked separately.

---

## 10. Related Knowledge Center Topics

- Stock Movement Rule — the detailed mechanics of stock tracking
- AI-Powered Monitoring — how the system detects compliance concerns
- Account Management — what happens when a trader is restricted
- Administrative Roles — which officers manage threshold exceptions
`,
    },

    // ── 4. Stock Movement ─────────────────────────────────────────────────
    {
        slug: "stock-movement-rule",
        title: "Stock Movement and Inventory Tracking — Complete Guide",
        section: "stock-movement",
        summary: "TaxFlow tracks every significant stock movement through the supply chain. Each product has an auditable lifecycle: opening stock, inbound movements, sales, transfers, damages, and closing stock. Unexplained inventory gaps trigger review alerts.",
        tags: ["stock", "inventory", "sell-through", "tracking", "reconciliation", "adjustments"],
        content: `# Stock Movement and Inventory Tracking — Complete Guide

## 1. Overview

Stock movement tracking is the operational foundation of TaxFlow's supply chain monitoring. Every significant product movement — receipts, sales, transfers, damages, adjustments — is recorded and linked to supporting evidence.

The goal is to maintain a continuous, auditable inventory record for every business and every product within the TaxFlow system. When stock movements cannot be fully reconciled, the system flags the gap for officer review.

---

## 2. Why Stock Movement Tracking Exists

Consider a simple scenario:

A retailer starts with 100 bottles of cooking oil. They sell 5 bottles. The correct remaining stock is 95 bottles.

If the retailer fails to record the 5-bottle sale, the system still shows 100 bottles. When the retailer next purchases 50 more bottles, the system now shows 150 bottles — but only 50 sales are recorded over time. The 50-bottle gap represents unrecorded transactions that may also represent unrecorded VAT and income.

TaxFlow's stock movement tracking makes this gap visible and creates a documented basis for investigation.

---

## 3. The Complete Stock Lifecycle

For every product at every registered business location, TaxFlow maintains the following stock record:

| Event Type | Description | Effect on Stock |
|-----------|-------------|----------------|
| **Opening Stock** | Stock balance at the start of the tracking period | Sets the baseline |
| **Inbound — Import** | Customs-verified import receipt | Increases available stock |
| **Inbound — B2B Receipt** | Buyer-confirmed purchase from supplier | Increases available stock |
| **Inbound — Production Output** | Manufacturer's declared finished goods | Increases available stock |
| **Outbound — EBM Retail Sale** | Sale to final customer (where integrated) | Decreases available stock |
| **Outbound — B2B Dispatch** | Sale/transfer to downstream buyer | Decreases available stock (pending confirmation) |
| **Outbound — Return to Supplier** | Product returned upstream | Decreases available stock |
| **Adjustment — Damage Write-off** | Approved damaged goods | Decreases available stock |
| **Adjustment — Expiry Write-off** | Approved expired goods | Decreases available stock |
| **Adjustment — Customer Return** | Product returned by customer | Increases available stock |
| **Adjustment — Correction** | Authorized data correction | Adjusts stock up or down |
| **Transfer — Out** | Move to another registered location | Decreases stock at source |
| **Transfer — In** | Receive from another registered location | Increases stock at destination |

---

## 4. Numerical Stock Reconciliation Example

### Scenario: A Wholesaler Over One Month

| Event | Quantity | Running Total |
|-------|---------|--------------|
| Opening stock (Month start) | +200 bags cement | 200 bags |
| Import receipt (Customs cleared) | +500 bags | 700 bags |
| B2B Sale to Retailer A (confirmed receipt) | -300 bags | 400 bags |
| Damage claim (flooding — approved) | -20 bags | 380 bags |
| B2B Sale to Retailer B (pending confirmation) | (reserved) | 380 bags available |
| B2B Receipt from Retailer A (return) | +10 bags | 390 bags |
| Month-end declared closing stock | 390 bags | — |
| **Reconciliation result** | **0 gap** | **MATCHED** |

If the wholesaler declares closing stock of 340 bags instead of 390 bags, the system flags a **50-bag unexplained gap** for officer review.

---

## 5. B2B Transaction States and Stock Impact

Understanding how B2B transactions affect stock is essential:

### Seller Side
| Transaction State | Stock Impact |
|-----------------|-------------|
| Order created | No impact |
| Order accepted | No impact |
| Dispatch recorded | Stock reserved (not yet deducted) |
| Buyer confirms receipt | Stock deducted — sale completed |
| Buyer rejects/disputes | Reservation released — no stock change |

### Buyer Side
| Transaction State | Stock Impact |
|-----------------|-------------|
| Order created | No impact |
| Dispatch recorded by seller | No impact |
| Receipt confirmed (accepted qty) | Accepted quantity added to available stock |
| Disputed/damaged quantity | Held in dispute — not added to available stock |
| Dispute resolved | Added to stock (if accepted) or written off |

> **Important:** Disputed and damaged quantities are never silently added to available stock. They must be formally resolved by an authorized officer before entering available inventory.

---

## 6. Stock Reconciliation Process

Authorized officers can perform stock reconciliation checks. The reconciliation compares:

**Expected Closing Stock = Opening Stock + All Inbound Movements − All Outbound Movements − Approved Adjustments**

If the declared closing stock differs from the calculated expected closing stock:

1. The system flags the difference as a **reconciliation gap**.
2. The gap amount and percentage are recorded.
3. If the gap exceeds a configured threshold, an alert is generated.
4. The officer reviews the transaction history for the period.
5. The officer may request documentation from the business.
6. The officer records findings and disposition.

---

## 7. Stock Adjustments — Rules and Process

Manual stock adjustments require authorization because they directly affect inventory records:

### Adjustment Process
1. Business submits adjustment request with reason and supporting documentation.
2. The request is flagged for officer review.
3. The officer reviews the reason, documentation, and history.
4. The officer approves or rejects the adjustment.
5. If approved, the inventory record is updated.
6. The adjustment and approval are recorded in the audit trail.

### Approved Adjustment Reasons

| Reason | Documentation Required |
|--------|----------------------|
| Product damage | Damage report, photographs, supervisor confirmation |
| Product expiry | Expiry date evidence, inventory record |
| Customer return | Return reference, original sale record |
| Data correction | Evidence of original recording error |
| Transfer to another location | Transfer record, receiving location confirmation |

### Adjustments That Are Not Approved

- Adjustments submitted without supporting documentation
- Repeated adjustments without reasonable explanation
- Adjustments that consistently and conveniently reduce stock to exactly the sell-through threshold
- Adjustments submitted by an unauthorized person

---

## 8. AI Monitoring of Stock Movements

The AI system monitors stock movements for the following patterns:

| Pattern | Description | Risk Level |
|---------|-------------|-----------|
| Repeated unexplained gaps | Closing stock consistently lower than calculated | Medium to High |
| Excessive adjustment frequency | Multiple adjustments per month without clear cause | Medium |
| Large single adjustments | One-time adjustments of unusual size | High |
| Adjustments near threshold dates | Adjustments submitted just before purchase eligibility review | High |
| Zero-sales periods with outbound movements | Stock leaving without recorded sales | High |
| Sudden inventory changes | Dramatic opening or closing stock changes without matching transactions | Critical |

---

## 9. Roles and Permissions

| Role | Can View Stock Records | Can Approve Adjustments | Can Trigger Reconciliation |
|------|----------------------|------------------------|---------------------------|
| Stock Administrator | Yes (assigned businesses) | Yes (within scope) | Yes |
| Compliance Officer | Yes (all) | No | Yes |
| Super Administrator | Yes (all) | Yes (all) | Yes |
| Manufacturer (business) | Own records only | Submit requests only | No |
| Retailer (business) | Own records only | Submit requests only | No |

---

## 10. Common Problems and Solutions

**Problem: A trader's sell-through percentage is below the threshold, but they claim their sales records are correct.**
Solution: The officer reviews all outbound movements. If sales are recorded but not matching (e.g., B2B receipts not confirmed by buyer), the officer may contact both parties to confirm and reconcile.

**Problem: A large damage claim was submitted that would bring a trader exactly to threshold.**
Solution: The officer reviews the claim carefully, may request independent verification, and documents the decision. The AI monitoring system will flag this pattern if it repeats.

**Problem: Stock records show a large gap but the trader cannot explain it.**
Solution: The officer opens a review case, requests all supporting documentation, and escalates if the gap remains unexplained after a reasonable period.

---

## 11. Frequently Asked Questions

**Q: Can a business manually edit their own inventory?**
A: No. Businesses can submit adjustment requests, but adjustments require officer approval before taking effect.

**Q: What happens if a confirmed receipt is later found to be incorrect?**
A: A correction request must be submitted with evidence. An authorized officer reviews and approves or rejects the correction.

**Q: Are all stock gaps automatically flagged as suspicious?**
A: No. Small gaps within configured tolerance ranges may not generate alerts. The system is calibrated to avoid unnecessary alerts for normal business variation.

---

## 12. Related Knowledge Center Topics

- Tax Compliance Threshold — how sell-through affects purchasing eligibility
- Supply Chain and Inventory — how stock moves between businesses
- Manufacturing and Production — how finished goods enter stock
- AI-Powered Monitoring — how the system detects inventory irregularities
`,
    },

    // ── 5. Imports ────────────────────────────────────────────────────────
    {
        slug: "import-declaration-customs",
        title: "Import Declaration and Customs Verification — Complete Guide",
        section: "imports",
        summary: "The complete lifecycle of an import in TaxFlow — from pre-import declaration through Customs physical inspection, quantity verification, discrepancy recording, and stock entry. Customs officers play a central role in verifying declared versus actual quantities.",
        tags: ["imports", "customs", "declaration", "verification", "clearance", "discrepancy"],
        content: `# Import Declaration and Customs Verification — Complete Guide

## 1. Overview

TaxFlow supports the recording, monitoring, and verification of imported products entering Rwanda. The import module connects pre-import declarations with Customs physical inspection records, and links verified import quantities to the importer's official inventory.

> **Important:** TaxFlow's import module records and monitors declarations. It does not replace the official Rwanda Customs clearance process. All legal customs procedures must be followed through the appropriate official channels.

---

## 2. Purpose and Objectives

The import verification process exists to:

- Ensure declared import quantities match physically inspected quantities.
- Connect imported goods to official inventory records, preventing unrecorded product from entering circulation.
- Create an auditable record for every significant import event.
- Detect patterns of quantity misrepresentation across multiple imports.
- Support Customs officers with structured declaration review workflows.

---

## 3. The Import Lifecycle — Ten Steps

### Step 1 — Importer Registration
Before importing, a business must be registered in TaxFlow with a valid TIN and appropriate account type. The import module is accessible to businesses with the relevant import permissions.

### Step 2 — Pre-Import Declaration
Before goods arrive, the importer submits a declaration including:

| Field | Description |
|-------|-------------|
| Product / raw material name | What is being imported |
| Product category | Classification for monitoring purposes |
| Declared quantity | How much is being imported |
| Unit of measurement | Bags, litres, kg, units, etc. |
| Country of origin | Where the product originates |
| Supplier information | Supplier name and reference where required |
| Expected arrival | Anticipated arrival date and entry point |
| Supporting documents | Invoice references, shipping documents where applicable |
| Declared value | Customs value for duty purposes |

### Step 3 — Import Routing to Customs Officer
The declaration is routed to the designated Customs officer for the relevant entry point (airport, border crossing, inland entry point).

### Step 4 — Physical Arrival
Goods arrive at the declared entry point.

### Step 5 — Customs Physical Inspection
The Customs officer:
1. Logs into the TaxFlow Customs dashboard.
2. Accesses the specific import declaration.
3. Reviews the declared quantities, product description, and documentation.
4. Performs physical inspection of the actual goods.
5. Counts, weighs, or measures the actual quantities as appropriate.
6. Compares actual quantities against declared quantities.

### Step 6 — Quantity Recording
The Customs officer records:
- **Declared quantity** — from the importer's pre-import declaration (preserved, cannot be altered)
- **Customs-verified quantity** — the quantity physically confirmed during inspection
- **Discrepancy** — the difference, if any

### Step 7 — Discrepancy Assessment
If the declared quantity differs from the verified quantity:
- The discrepancy is recorded with the amount and percentage difference.
- The officer documents observations about the nature of the discrepancy.
- The officer may flag the import for further review.
- Significant or repeated discrepancies may trigger an AI monitoring alert.

### Step 8 — Import Decision
The Customs officer records one of the following:
- **Approved** — goods cleared for entry at the verified quantity
- **Partially approved** — portion cleared, remainder held for further review
- **Rejected** — goods refused entry with documented reason
- **Flagged** — cleared but flagged for follow-up investigation

### Step 9 — Inventory Entry
When an import is approved, the Customs-verified quantity (not the declared quantity) is used to create the inventory entry in the importer's TaxFlow account.

> **Critical rule:** The trader cannot alter the Customs-verified quantity. Only an authorized Customs officer or designated reviewing officer can amend verified import records, with documented justification.

### Step 10 — Subsequent Tracking
Once goods enter the importer's inventory, TaxFlow tracks their distribution: sales to retailers, B2B transfers, or further processing. The import origin is preserved as part of the product's traceability record.

---

## 4. Import Information Reference

### What the Customs Officer Can See

| Information | Access |
|-------------|-------|
| Import declaration details | Full access |
| Importer's TIN and business profile | Summary access |
| Previous import history for this importer | Yes |
| Previous discrepancy history for this importer | Yes |
| Supporting documents submitted by importer | Yes |
| Import status (pending, in-progress, cleared) | Yes |

### What the Customs Officer Records

| Information | Notes |
|-------------|-------|
| Inspection date and time | Automatically timestamped |
| Physical quantity inspected | Officer records manually |
| Discrepancy amount | Auto-calculated from declared vs verified |
| Inspection notes | Officer adds qualitative observations |
| Decision (approve/reject/flag) | Officer selection |
| Supporting evidence references | Documents attached by officer |

---

## 5. Practical Discrepancy Example

**Scenario:**

| Item | Value |
|------|-------|
| Declared product | Rice (Grade A) |
| Declared quantity | 1,000 kg |
| Customs-verified quantity | 950 kg |
| Discrepancy | 50 kg (5% under-delivery) |
| Officer observation | Partial damage to one pallet noted |

**System records:**
- Original declared: 1,000 kg (preserved, cannot be changed)
- Customs verified: 950 kg (enters inventory)
- Discrepancy: 50 kg flagged with officer explanation

The importer's TaxFlow inventory receives 950 kg, not 1,000 kg. The 50 kg discrepancy is documented and may require follow-up if no explanation is on file.

---

## 6. Discrepancy Risk Detection

The AI monitoring system analyzes import patterns and flags:

| Pattern | Trigger | Risk Level |
|---------|---------|-----------|
| Quantity under-declared | Verified quantity significantly exceeds declared | Medium to High |
| Quantity over-declared | Verified quantity significantly below declared | Medium to High |
| Repeated discrepancy | Multiple imports with consistent gaps | High |
| Zero-discrepancy pattern followed by large discrepancy | Sudden change in declaration accuracy | Medium |
| Product description inconsistency | Verified product differs from declared | High |
| Duplicate import reference | Same reference used twice | Critical |

---

## 7. Roles and Responsibilities

### Customs Officer
- Review import declarations assigned to their entry point
- Conduct physical inspection
- Record verified quantities accurately
- Document discrepancies with clear observations
- Make approved/rejected/flagged decisions
- Escalate unusual or suspicious imports

### Compliance Officer
- Review import discrepancy alerts
- Investigate patterns of repeated discrepancy
- Request clarification from importers
- Escalate cases requiring formal action

### Super Administrator
- Configure import monitoring rules
- Review and assign escalated import cases
- Access full import history for any business

---

## 8. What Customs Officers Must Not Do

- Alter the importer's original declared quantities (the original declaration is preserved).
- Approve an import without completing physical inspection.
- Record verified quantities without supporting inspection evidence.
- Accept consideration from an importer in connection with import verification.
- Share import details with unauthorized parties.

---

## 9. Common Questions

**Q: Who enters the Customs-verified quantity — the importer or the Customs officer?**
A: The Customs officer enters the verified quantity based on physical inspection. The importer cannot modify the Customs-verified record.

**Q: What if the importer disputes the Customs-verified quantity?**
A: The importer must submit a formal dispute through the authorized channel. A reviewing officer examines the evidence. The original Customs record is preserved during the dispute process.

**Q: If goods are damaged during transit, is the damaged quantity verified or the original declared quantity used?**
A: The Customs-verified quantity (which may account for the damage) is used for inventory entry. Damage documentation should be recorded by the Customs officer as part of the inspection record.

---

## 10. Related Knowledge Center Topics

- Supply Chain and Inventory — how imported goods flow through the supply chain
- AI-Powered Monitoring — how import discrepancy patterns are detected
- Manufacturing and Production — how imported raw materials enter production
- Administrative Roles — Customs officer responsibilities in detail
`,
    },

    // ── 6. Manufacturing ─────────────────────────────────────────────────
    {
        slug: "manufacturing-production",
        title: "Manufacturing and Production Monitoring — Complete Guide",
        section: "manufacturing",
        summary: "TaxFlow monitors the complete manufacturing process from planned production through material consumption to finished goods output. Confidential manufacturing formulas are protected — standard monitoring officers see protected identifiers, not material names.",
        tags: ["manufacturing", "production", "materials", "output", "traceability", "confidentiality"],
        content: `# Manufacturing and Production Monitoring — Complete Guide

## 1. Overview

Manufacturing monitoring is one of TaxFlow's most critical functions. The system tracks the complete manufacturing journey — from planned production and material registration, through actual consumption and output, to finished goods entering inventory.

The objective is to prevent products from entering the market without being properly recorded. If a manufacturer produces 1,000 units but declares only 850, the remaining 150 units may circulate without VAT, without traceability, and without contributing to the tax base.

> **Confidentiality requirement:** Manufacturers often use commercially sensitive production formulas. Standard monitoring personnel see protected material identifiers, not material names. Only officers with specific, authorized confidential-recipe permission can access formula details — and that access is separately logged.

---

## 2. The Manufacturing Workflow — Seven Stages

### Stage 1 — Production Planning

Before manufacturing begins, the manufacturer registers a production plan containing:

| Field | Description |
|-------|-------------|
| Product to be manufactured | Finished goods name and product code |
| Planned production quantity | Expected output units |
| Unit of measurement | Litres, kg, units, etc. |
| Production period | Start and end dates |
| Recipe / production plan version | Which authorized formula is being used |
| Expected material usage | Quantities of each input material planned |

**Why this matters:** The production plan creates the baseline against which actual output is later compared. Without a registered plan, there is no reference point for detecting deviations.

### Stage 2 — Material Registration

The manufacturer registers the specific materials planned for use in this production run:

- Material identifier (protected or disclosed depending on permissions)
- Planned quantity for this production run
- Unit of measurement
- Source of material (import reference, local purchase reference)

### Stage 3 — Actual Material Consumption

As production proceeds, the manufacturer records actual quantities of each material consumed. This may differ from planned quantities due to legitimate production variation.

The system preserves both planned and actual consumption for comparison.

### Stage 4 — Production Completion Declaration

When production is finished, the manufacturer declares:
- Actual finished goods output quantity
- Completion date
- Any production anomalies or notes

### Stage 5 — Production Reconciliation

TaxFlow performs an automated reconciliation comparing:

| Comparison | Purpose |
|-----------|---------|
| Planned quantity vs. actual output | Identifies production efficiency variance |
| Expected material consumption vs. actual consumption | Identifies material usage efficiency |
| Current production vs. historical patterns | Identifies statistical deviations |
| Output vs. approved tolerance range | Flags results outside acceptable variance |

If the reconciliation identifies significant deviation, the monitoring system generates a review signal.

### Stage 6 — Finished Goods Inventory Entry

When a production declaration is validated:
- The declared finished goods quantity enters the manufacturer's available inventory.
- The inventory entry is linked to the production record for traceability.
- The materials consumed are deducted from the material inventory.

### Stage 7 — Product Dispatch

The manufacturer records dispatch of finished goods to buyers. Each dispatch:
- Deducts the dispatched quantity from the manufacturer's inventory.
- Creates a pending B2B transaction on the buyer's side.
- Begins the supply chain traceability chain for those units.

---

## 3. Confidence Interval and Production Tolerance

Manufacturing inherently involves variation. TaxFlow uses configurable tolerance ranges to distinguish normal variation from significant discrepancy.

### How Tolerance Works

**Example — Normal variation:**
- Planned output: 1,000 litres
- Approved tolerance: ±5%
- Acceptable range: 950 to 1,050 litres
- Actual output: 970 litres → Within tolerance → No alert

**Example — Deviation requiring review:**
- Planned output: 1,000 litres
- Approved tolerance: ±5%
- Acceptable range: 950 to 1,050 litres
- Actual output: 850 litres → 15% below plan → Alert generated

### Tolerance Configuration

Tolerances are product-specific and must be:
- Based on approved production evidence and industry standards
- Set by an authorized administrator
- Documented with the supporting rationale
- Reviewed and updated when production processes change

---

## 4. Historical Comparison Analysis

TaxFlow tracks each manufacturer's production history and uses it as a baseline for evaluating current production.

### Why Historical Comparison Matters

A manufacturer who consistently produces approximately 1 litre per kg of raw material, then declares a batch producing only 0.1 litres per kg, has dramatically reduced efficiency. Even if the declared quantities are within a tolerance range on their own, the efficiency ratio comparison may reveal a significant anomaly.

### Historical Comparison Example

**Previous production record (5 batches average):**
- Material used: 850 kg
- Output produced: 1,000 litres
- Efficiency ratio: 1.176 litres per kg

**New production declaration:**
- Material used: 851 kg
- Declared output: 102 litres
- Efficiency ratio: 0.120 litres per kg

**AI detection:** The efficiency ratio has dropped by approximately 90%. This is a significant statistical deviation from the established pattern and warrants immediate review.

**System response:** Generate a Critical or High alert documenting:
- The historical efficiency ratio (from previous 5 batches)
- The current declared efficiency ratio
- The percentage deviation
- The specific production batch reference

---

## 5. Confidentiality of Manufacturing Formulas

This is a critical requirement for manufacturers who use commercially sensitive recipes and processes.

### Two Views of Manufacturing Data

#### Manufacturer's Own View
When an authorized manufacturer user views their own production records, they see:
- Full material names and descriptions
- Complete quantities
- Full recipe and production plan details
- Their own production history

#### Standard TF Officer View
When a standard monitoring officer reviews a manufacturer's records, they see:

| What They See | Example |
|-------------|---------|
| Protected material identifier | ◆◆◆◆◆◆◆◆ |
| Material quantity | 12 kg |
| Production metrics | Output: 1,000 litres |
| Variance data | -15% from plan |
| Risk signals | High deviation alert |

**Example of protected view:**

~~~
Material 1: ◆◆◆◆◆◆◆◆◆◆◆◆ — 12 kg (planned: 12 kg) ✓
Material 2: ◆◆◆◆◆◆◆◆◆◆◆◆ — 9 kg (planned: 8.5 kg) ⚠
Material 3: ◆◆◆◆◆◆◆◆◆◆◆◆ — 3 kg (planned: 3 kg) ✓

Planned output: 1,000 litres
Actual output: 102 litres ⚠ SIGNIFICANT DEVIATION
~~~

The officer can see that Material 2 was slightly over-consumed and the output is drastically below plan — without learning what Material 2 is.

#### Confidential Recipe Access
Only officers with the **dedicated confidential-recipe permission** can see actual material names. This permission:
- Must be explicitly granted by Super Administrator
- Requires documented justification for each access session
- Is logged in the audit trail with the reason, timestamp, and officer identity
- Super Administrator status alone does NOT automatically grant this permission

---

## 6. AI Manufacturing Monitoring

The AI system continuously monitors manufacturing records for:

| Pattern | Description | Typical Risk Level |
|---------|-------------|-------------------|
| Output below tolerance | Actual output significantly below plan | Medium to High |
| Efficiency ratio change | Dramatic change in output per unit of material | High to Critical |
| Repeated discrepancies | Consistent under-declaration across batches | High |
| Unusual material over-consumption | Materials used far exceed plan without output increase | Medium to High |
| Production cancellations | Repeated batch cancellations, especially near review periods | Medium |
| Formula version changes | Sudden change in production formula without business justification | Medium |
| Batch timing anomalies | Production declared outside normal business hours or periods | Low to Medium |

---

## 7. Officer Intervention Process

When a manufacturing alert is generated, the authorized officer:

**Step 1:** Opens the alert and reviews the evidence:
- Production plan vs. actual comparison
- Historical production data for context
- Material consumption comparison
- Specific deviation metrics

**Step 2:** Assesses the information:
- Is there a plausible legitimate explanation?
- Is this a one-time event or a pattern?
- What is the magnitude of the discrepancy?

**Step 3:** Takes appropriate action:
| Action | When Appropriate |
|--------|----------------|
| Request clarification from manufacturer | When explanation may be legitimate |
| Assign to manufacturing specialist | Complex technical assessment needed |
| Flag production batch | Prevent associated stock from being distributed pending review |
| Open investigation case | Pattern of significant discrepancy |
| Escalate to senior officer | Systematic concern requiring senior authorization |
| Close with explanation | Legitimate explanation confirmed and documented |

**Step 4:** Records all findings:
- What evidence was reviewed
- What explanation (if any) was provided
- What action was taken
- The documented reason

---

## 8. What Manufacturing Officers Must Not Do

- Access confidential material names without the specific permission and documented justification.
- Automatically classify a production deviation as fraud without review.
- Approve a production declaration they have not reviewed when an alert is active.
- Share confidential recipe access with other officers who do not have the permission.
- Approve adjustments to production records without proper documentation.

---

## 9. Common Questions

**Q: Can a manufacturer explain a production deviation after the fact?**
A: Yes. The manufacturer should submit a clarification request with supporting evidence. The officer reviews the explanation and documents the outcome. The alert remains in the audit record even if resolved.

**Q: What if equipment failure caused the low output?**
A: Equipment failure is a valid explanation if supported by evidence (maintenance records, engineer report). The officer reviews, confirms, and documents the explanation. The production record remains as declared.

**Q: Who can access confidential manufacturing formula information?**
A: Only officers with the specific confidential-recipe permission, granted explicitly by Super Administrator, with documented justification per access session.

---

## 10. Related Knowledge Center Topics

- Supply Chain and Inventory — how finished goods flow from manufacturer to market
- AI-Powered Monitoring — how manufacturing anomalies are detected
- Security and Audit Trail — how confidential access is protected and logged
- Administrative Roles — which officers handle manufacturing monitoring
`,
    },

    // ── 7. Supply Chain ─────────────────────────────────────────────────
    {
        slug: "supply-chain-inventory",
        title: "Supply Chain and Inventory Tracking — Complete Guide",
        section: "supply-chain",
        summary: "TaxFlow connects businesses through linked transaction records. Every B2B product movement — from manufacturer through wholesaler to retailer — creates a traceable chain. Disputed and damaged quantities are tracked separately from available stock.",
        tags: ["supply-chain", "b2b", "inventory", "transactions", "traceability", "receipts"],
        content: `# Supply Chain and Inventory Tracking — Complete Guide

## 1. Overview

TaxFlow maintains traceability across the full supply chain by linking every significant product movement between businesses. When a manufacturer dispatches goods, a wholesaler receives them, a distributor redistributes them, and a retailer sells them — every step is recorded, linked, and available for authorized review.

This traceability system makes it possible to:
- Follow a product from manufacturer to final customer.
- Identify where in the chain a product disappears from records.
- Compare seller's dispatch records with buyer's receipt records.
- Detect products appearing in distribution without traceable origin.

---

## 2. Supply Chain Participants

| Participant | Role |
|-------------|------|
| **Manufacturer** | Produces finished goods from raw materials; dispatches to wholesalers |
| **Importer / Wholesaler** | Receives goods (from manufacturers or through imports); distributes to retailers |
| **Distributor** | Intermediate handler; may repackage, redistribute, or store |
| **Retailer** | Sells to final customers; generates EBM sales records |
| **Final Customer** | End consumer; EBM receipt is the final transaction record |

---

## 3. The B2B Transaction Lifecycle

Every B2B (business-to-business) transaction in TaxFlow follows a defined lifecycle with clear effects on inventory at both ends.

### Phase 1 — Order Creation
The buyer creates a purchase order. No stock movement occurs yet.

### Phase 2 — Seller Acceptance
The seller accepts the order. No stock movement yet, but the transaction is confirmed.

### Phase 3 — Seller Dispatch
The seller records the dispatch. The dispatched quantity is **reserved** in the seller's inventory (not yet deducted — it is on its way).

### Phase 4 — Buyer Receipt Processing
When goods arrive, the buyer inspects and records:

| Quantity Type | Description | Stock Impact |
|-------------|-------------|-------------|
| **Accepted quantity** | Goods received in acceptable condition | Added to buyer's available stock immediately |
| **Damaged quantity** | Goods received in damaged state | Held in dispute — NOT added to available stock |
| **Rejected quantity** | Goods refused (wrong product, wrong quantity) | Returned to seller; not added to stock |
| **Disputed quantity** | Buyer disputes the quantity received | Held pending resolution |

### Phase 5 — Seller Stock Update
Once the buyer confirms receipt:
- The accepted quantity is **deducted** from the seller's inventory (the reservation becomes a completed sale).
- Returned or rejected quantities are **returned** to the seller's available stock.
- Disputed quantities remain reserved until resolved.

### Phase 6 — Dispute Resolution
Disputes are reviewed by an authorized officer who:
- Reviews evidence from both buyer and seller.
- Determines the correct quantity.
- Records the resolution.
- Updates inventory on both sides accordingly.

---

## 4. Traceability Example — Complete Journey

**Scenario: 1,000 bottles of juice, manufactured and distributed**

| Stage | Event | Quantity | Record |
|-------|-------|---------|--------|
| Manufacturer | Production declared | 1,000 bottles | Production record #PRD-001 |
| Manufacturer → Wholesaler | Dispatch recorded | 500 bottles | B2B Dispatch #DSP-001 |
| Wholesaler | Receipt confirmation | Accepted: 480; Disputed: 20 | B2B Receipt #RCV-001 |
| Wholesaler → Retailer A | Dispatch | 200 bottles | B2B Dispatch #DSP-002 |
| Retailer A | Receipt confirmation | Accepted: 200 | B2B Receipt #RCV-002 |
| Retailer A | EBM Sales (3 days) | 150 bottles | EBM records |
| Retailer A | Inventory | 50 bottles remaining | Closing stock |

**TaxFlow can trace:**
- The 480 accepted bottles from the manufacturer's production through to the wholesaler's inventory.
- 200 of those bottles moved to Retailer A.
- 150 bottles were sold (EBM records).
- 50 bottles remain in Retailer A's stock.
- 20 disputed bottles remain in the wholesaler's dispute queue pending resolution.
- 500 bottles remain at the manufacturer (original 1,000 minus 500 dispatched).

**What TaxFlow flags:**
- If the wholesaler's inventory shows only 260 bottles instead of the expected 280 (480 accepted − 200 dispatched), a 20-bottle gap is flagged.

---

## 5. The Disputed and Damaged Quantity Rule

This is one of the most important rules in TaxFlow's supply chain tracking:

> **Rule: Disputed, damaged, or rejected quantities are NEVER automatically added to available stock. They must be formally resolved by an authorized officer before entering available inventory.**

**Why this matters:**

Without this rule, a buyer could:
1. Receive 480 bottles of 500 ordered.
2. Claim 500 bottles were received.
3. Have 20 fictitious bottles available for unrecorded sale.

Or a seller could:
1. Dispatch 500 bottles.
2. Claim only 400 were accepted (20 more returned to stock).
3. Have 100 bottles available for off-the-books sale.

The confirmed receipt process — with separate tracking of accepted, damaged, and disputed quantities — prevents both manipulations.

---

## 6. Cross-Business Record Comparison

TaxFlow can compare seller and buyer records for the same transaction:

| Field | Seller Record | Buyer Record | Acceptable? |
|-------|-------------|-------------|------------|
| Dispatched quantity | 500 bottles | Received: 480 accepted | Yes — difference explained by damage |
| Product identity | Juice, 500ml | Juice, 500ml | Match |
| Dispatch date | 1 Nov | Received 2 Nov | Acceptable transit time |
| Disputed quantity | 20 bottles (seller view) | 20 bottles (buyer view) | Match — in dispute queue |

If the seller's dispatch record shows 500 bottles but the buyer's receipt record shows only 400 accepted and 0 disputed, the system flags a **100-bottle unresolved gap** for officer review.

---

## 7. Products in Inventory Without Traceable Origin

A significant supply chain alert is generated when:

- A business's inventory contains a product that cannot be linked to an import record, a production record, or a confirmed B2B purchase record.
- The quantity in inventory exceeds what can be explained by known sources.

**Example:**
A retailer's inventory shows 500 bags of rice. Their confirmed B2B purchases total 350 bags. No import record exists for this product. The 150-bag gap has no traceable source — this triggers a High-priority alert.

---

## 8. Officer Investigation of Supply Chain Gaps

When a supply chain discrepancy is flagged:

**Step 1:** Review the inventory record and the full transaction history for the flagged period.

**Step 2:** Identify the specific gap — is it a missing receipt confirmation, a data entry error, or a genuinely unrecorded transaction?

**Step 3:** Contact the relevant businesses (both seller and buyer) for clarification.

**Step 4:** Review any supporting documentation submitted.

**Step 5:** Record findings and disposition:
- If a data error: approve correction with documentation.
- If a legitimate explanation: document and close.
- If genuinely unexplained: escalate for formal investigation.

---

## 9. Roles and Permissions

| Role | Can View Supply Chain Records | Can Resolve Disputes | Can Investigate Gaps |
|------|------------------------------|---------------------|----------------------|
| Stock Administrator | Yes (assigned businesses) | Yes | Yes |
| Compliance Officer | Yes (all businesses) | No (refer to stock admin) | Yes |
| Super Administrator | Yes (all) | Yes | Yes |
| AI/Risk Analyst | Yes (read only) | No | Recommend — officer decides |

---

## 10. Common Questions

**Q: What if a buyer confirms receipt of more goods than the seller dispatched?**
A: The system flags the discrepancy. An officer reviews both records. The excess quantity is not added to available stock until the discrepancy is resolved.

**Q: Can a business in the supply chain see another business's inventory?**
A: No. Businesses can only see their own inventory and their own transactions. Cross-business visibility is restricted to authorized RRA officers.

**Q: How long are supply chain records retained?**
A: Records are retained according to applicable data retention policies. Current implementation preserves all supply chain records indefinitely for audit purposes.

---

## 11. Related Knowledge Center Topics

- Stock Movement Rule — the mechanics of individual business inventory tracking
- Manufacturing and Production — how goods enter the supply chain
- Import Declaration and Customs — how imported goods begin their chain
- AI-Powered Monitoring — how supply chain gaps are detected
`,
    },

    // ── 8. TIN Verification ──────────────────────────────────────────────
    {
        slug: "tin-verification",
        title: "TIN Verification and Trader Registration — Complete Guide",
        section: "tin-verification",
        summary: "TaxFlow relies on verified TIN registration to ensure only legitimately registered traders participate in the controlled trading ecosystem. Officers must follow proper verification procedures and protect sensitive taxpayer information.",
        tags: ["tin", "verification", "registration", "taxpayer", "identity", "compliance"],
        content: `# TIN Verification and Trader Registration — Complete Guide

## 1. Overview

The Tax Identification Number (TIN) is the foundation of business identity in Rwanda's tax system. Every business participating in TaxFlow must have a valid, registered TIN that connects their commercial activities to their official tax record.

TIN verification ensures that:
- Only legitimately registered businesses access TaxFlow's trading features.
- Business activities can be linked to official taxpayer records.
- Duplicate or fraudulent registrations are identified and prevented.
- Sensitive taxpayer information is accessible only to authorized officers.

---

## 2. Why TIN Verification Matters

### Preventing Unregistered Commercial Activity

One of the core problems TaxFlow addresses is businesses conducting commercial activities — buying, selling, importing — without valid TIN registration. Unregistered businesses:
- Cannot be linked to tax records.
- Cannot be monitored through the official supply chain.
- May operate outside the tax net entirely.

TIN verification at account creation prevents unregistered businesses from entering the system.

### Preventing Duplicate Registrations

A single business entity should have one TIN. Duplicate registrations may allow a business to fragment its activities, obscuring its full commercial scale from monitoring.

### Supporting Tax Investigations

When an irregularity is discovered, officers need reliable identity information to pursue investigations. Verified TIN records provide that foundation.

---

## 3. Trader Registration Workflow

### Step 1 — Account Application
A business submits an account application through the authorized channel, providing:
- TIN
- Business registration name
- Business type (manufacturer, wholesaler, retailer, importer)
- Contact information
- Supporting documentation (business registration certificate, etc.)

### Step 2 — Initial TIN Verification
An authorized officer verifies the TIN against the reference database:
- Confirm the TIN exists in the official registry.
- Confirm the registered business name matches the TIN.
- Confirm the registration status (active, suspended, etc.).
- Check for duplicate applications for the same TIN.

### Step 3 — Business Category Review
The officer confirms the appropriate business category:
- Manufacturer — eligible to register production activities
- Importer/Wholesaler — eligible to submit import declarations
- Retailer — eligible to record purchases and sales
- Mixed — eligible for applicable combinations

The business category determines which TaxFlow modules are accessible.

### Step 4 — Document Review
The officer reviews submitted documentation:
- Business registration certificate validity
- Registered address consistency
- Contact information accuracy
- Any historical compliance issues on record

### Step 5 — Account Decision
The officer records one of:
- **Approved** — account activated
- **Pending information** — application held pending additional documents
- **Rejected** — application denied with documented reason

### Step 6 — Notification
The applicant is notified of the decision through the appropriate channel.

### Step 7 — Account Activation
If approved, the business account is activated in TaxFlow with the appropriate permissions for their registered category.

---

## 4. Information Officers May Verify

Subject to their permissions and lawful access, officers may review:

| Field | Description |
|-------|-------------|
| **TIN** | The 9-digit Taxpayer Identification Number |
| **Registered business name** | Official name as registered with RDB/RRA |
| **Business registration number** | Company registration reference |
| **Taxpayer type** | Individual, company, partnership, etc. |
| **Registration status** | Active, suspended, deregistered |
| **Registered address** | Official business address |
| **Contact information** | Phone, email (subject to privacy rules) |
| **TaxFlow account status** | Active, pending, suspended, deactivated |
| **Account type** | Manufacturer, wholesaler, retailer, etc. |
| **Assigned roles and permissions** | What the account can do in TaxFlow |
| **Account history** | Previous approvals, suspensions, restorations |

---

## 5. TIN Verification During Officer Operations

Officers performing operational tasks (reviewing transactions, investigating alerts) may need to verify a TIN mid-workflow. The recommended verification process:

**Step 1:** Enter or retrieve the TIN to be verified.

**Step 2:** Retrieve the taxpayer record from the authorized source (TaxFlow account record or authorized external database query).

**Step 3:** Compare submitted information against the official record:
- Do the names match?
- Is the registration status active?
- Does the contact information match what was provided?

**Step 4:** Identify discrepancies:
- Name mismatch — may indicate identity fraud or data error
- Registration suspended — business may not be eligible to operate
- TIN not found — may indicate unregistered business

**Step 5:** Record the verification result in the case record.

**Step 6:** Take appropriate action or escalate.

---

## 6. Example — Taxpayer Contact Scenario

**Scenario:** A person contacts TF administration claiming to be a registered retailer and asking to update their email address.

**Officer response:**

1. **Request identification.** Ask for TIN and registered business name.
2. **Retrieve the record.** Look up the TIN in TaxFlow.
3. **Verify identity.** Ask caller to confirm additional verification details (registered phone number, business registration number, or other approved verification method).
4. **Compare information.** Confirm the caller's details match the official record.
5. **Assess the request.** Is an email address update within the officer's authorized scope?
6. **Process or escalate.** If authorized, update and document. If the update requires additional approval, escalate.
7. **Record the interaction.** Document the caller, request, verification method, and outcome.
8. **Notify.** Confirm the change to the contact (through an already-verified channel if possible).

---

## 7. Sensitive Information Protection

Taxpayer information must be treated as sensitive data at all times:

| Principle | Application |
|-----------|-------------|
| **Need to know** | Access only information needed for the specific task |
| **Authorized purpose** | Use information only for the authorized reason |
| **No unnecessary disclosure** | Do not share taxpayer information with unauthorized parties |
| **Logging** | Access to taxpayer records is logged in the audit trail |
| **Data minimization** | Retrieve only the specific fields needed |

> Unauthorized disclosure of taxpayer information may constitute a serious violation of applicable law and RRA policy.

---

## 8. What Officers Must Not Do

- Access TIN information without an authorized reason.
- Share taxpayer details with third parties.
- Modify TIN or registration information without proper authorization and documentation.
- Approve a TaxFlow account for a TIN that is suspended or deregistered.
- Create duplicate TaxFlow accounts for the same TIN.
- Bypass the identity verification step when processing taxpayer requests.

---

## 9. Common Questions

**Q: Can a business have multiple TaxFlow accounts?**
A: A single TIN should have one TaxFlow account. Multiple business locations may be managed as sub-accounts or locations within the same account depending on the account structure.

**Q: What if the TIN provided does not match the official registry?**
A: The officer should not approve the application. The applicant should be directed to resolve the TIN discrepancy with RRA before reapplying.

**Q: Who can suspend a TaxFlow account for TIN-related issues?**
A: Authorized officers with account management permissions can suspend accounts. Super Administrator has full account management authority. The reason must be documented.

---

## 10. Related Knowledge Center Topics

- Account Management — the full account lifecycle
- Security and Audit Trail — how taxpayer data access is protected and logged
- Administrative Roles — which officers handle TIN verification
- About TaxFlow — why TIN verification is fundamental to the system
`,
    },

    // ── 9. Tax and EBM ───────────────────────────────────────────────────
    {
        slug: "tax-compliance-ebm",
        title: "Tax Compliance and EBM Integration — Complete Guide",
        section: "tax-ebm",
        summary: "TaxFlow supports tax compliance monitoring by connecting purchase records, sales records, inventory movements, and EBM data. EBM integration is a planned future capability — current monitoring uses manually submitted transaction data.",
        tags: ["tax", "ebm", "vat", "compliance", "reconciliation", "assessment"],
        content: `# Tax Compliance and EBM Integration — Complete Guide

## 1. Overview

Tax compliance monitoring in TaxFlow connects the commercial activity records — purchases, sales, inventory movements — with available tax declaration and payment information. The goal is to identify discrepancies that may indicate underreported sales, overstated input claims, or other compliance concerns.

> **EBM Integration Status:** Full real-time integration with Electronic Billing Machine (EBM) systems is a **planned future capability**. The current TaxFlow implementation uses manually submitted sales records and B2B transaction confirmations. Full EBM integration will be announced separately when available. This documentation describes both the current approach and the intended future integrated approach.

---

## 2. Purpose and Objectives

Tax compliance monitoring aims to:
- Compare recorded commercial activities with declared tax obligations.
- Identify gaps between known transactions and tax declarations.
- Support evidence-based referrals for formal tax investigation.
- Prioritize officer attention on the highest-risk compliance concerns.
- Protect businesses with good compliance records from unnecessary scrutiny.

---

## 3. Tax Compliance Monitoring — What Is Tracked

### Purchase Records
Every B2B purchase confirmed in TaxFlow represents:
- Input goods that the buyer should be able to claim as input tax (VAT).
- Stock that should subsequently appear in inventory and sales records.

### Sales Records
Every B2B sale confirmed in TaxFlow represents:
- Output goods that the seller must declare as output tax (VAT).
- Stock that should leave the seller's inventory.

### Inventory Movements
When stock enters or leaves inventory without a corresponding sale or purchase record, it creates a potential compliance concern.

### EBM Transaction Data (Future Integration)
When EBM integration is active, retail sales data from Electronic Billing Machines will provide direct evidence of sales to final customers. This data can then be compared against:
- Purchase records (did the retailer buy the goods they claim to have sold?)
- Inventory records (were the goods in inventory before being sold?)
- VAT declarations (were the EBM sales correctly reported?)

---

## 4. The Reconciliation Framework

### Input–Output Reconciliation

For any business in any period, TaxFlow can calculate:

**Expected Output = Opening Stock + Inbound Purchases − Authorized Adjustments**

If the closing stock is significantly less than expected, and recorded sales do not account for the difference, there may be unrecorded transactions.

| Reconciliation Element | Source |
|-----------------------|--------|
| Opening stock | Previous period closing stock |
| Inbound purchases | Confirmed B2B receipts + import records |
| Authorized adjustments | Approved damage, expiry, return records |
| Recorded sales | Confirmed B2B dispatches + EBM sales (where integrated) |
| Expected closing stock | Calculated: Opening + In − Sales − Adjustments |
| Declared closing stock | Business's declared inventory |
| **Reconciliation gap** | Expected minus declared |

### VAT Reconciliation

For registered VAT businesses:

| Item | Expected Source |
|------|----------------|
| Output VAT declared | Based on recorded sales |
| Input VAT claimed | Based on confirmed purchases |
| Net VAT position | Output minus Input |

If a business's declared sales are significantly lower than the transactions recorded in TaxFlow, the VAT output declared may be understated.

---

## 5. Practical Reconciliation Example

**Scenario — Retailer over three months:**

| Item | Amount |
|------|--------|
| Opening stock (Month 1) | 200 bags rice |
| Confirmed B2B purchases | 500 bags rice |
| Total available | 700 bags rice |
| Approved adjustments (damage) | 10 bags |
| Expected closing stock | 700 − recorded sales − 10 |
| **If recorded sales = 500 bags:** | Closing stock should be 190 bags |
| **Declared closing stock:** | 150 bags |
| **Reconciliation gap:** | 40 bags unexplained |

**40 bags** are unaccounted for — not in sales records, not in adjustment records, but missing from inventory. This gap triggers a review alert.

**Possible explanations (officer must investigate):**
- Unrecorded sales (missing EBM records or B2B confirmations)
- Data entry error
- Unreported stock damage
- Product theft
- Incorrect opening stock figure

---

## 6. EBM Integration — Current Status and Future Direction

### Current State (Without Full EBM Integration)
- TaxFlow relies on B2B transaction records (seller dispatch + buyer receipt confirmation).
- Retail sales to final customers are submitted manually or not yet tracked at the final retail level.
- Reconciliation can identify gaps in the B2B chain but may have limited visibility into the final retail transaction.

### Future State (With Full EBM Integration)
When EBM integration is active:
- Real-time EBM sales data will flow into TaxFlow from participating retailers.
- TaxFlow will automatically compare EBM sales against:
  - Inventory records (were goods available to sell?)
  - Purchase records (were goods sourced legitimately?)
  - Tax declarations (were sales declared correctly?)
- Discrepancies will generate automated alerts for officer review.

### Example of Future EBM Reconciliation
A retailer has 100 confirmed B2B purchase records for rice (various dates, various quantities totaling 1,000 kg). EBM integration data shows 820 kg sold. Declared closing stock is 100 kg.

Expected: 1,000 − 820 = 180 kg remaining.
Declared: 100 kg.
Gap: 80 kg unexplained.

Alert generated for officer review.

---

## 7. Officer Actions for Compliance Concerns

When a tax compliance concern is flagged:

| Action | Description |
|--------|-------------|
| **Review records** | Examine all relevant purchase, sale, and inventory records |
| **Calculate the gap** | Determine the specific discrepancy amount and percentage |
| **Assess materiality** | Is the gap within normal variation or significant? |
| **Request clarification** | Contact the business for explanation and supporting documentation |
| **Examine history** | Is this a new pattern or recurring concern? |
| **Record findings** | Document what was reviewed, what was found |
| **Escalate for formal review** | If the gap is material and unexplained, refer for formal investigation |
| **Close with explanation** | If a satisfactory explanation is found, document and close |

---

## 8. Separating Operational Monitoring from Legal Assessment

This distinction is essential:

| TaxFlow Monitoring | Formal Tax Assessment |
|-------------------|-----------------------|
| Identifies patterns that may warrant review | Legally determines tax liability |
| Generates alerts for officer review | Requires formal RRA procedures |
| Documents evidence | Is subject to legal challenge and appeal |
| Supports investigation | Is the foundation for legal action |
| Does not establish tax fraud | Is required before penalties can be imposed |

TaxFlow compliance monitoring is an intelligence tool. It informs officer decisions. It does not replace the formal RRA tax assessment process.

---

## 9. Roles and Permissions

| Role | Can View Compliance Data | Can Initiate Formal Referral | Can Access Tax Declarations |
|------|--------------------------|------------------------------|----------------------------|
| Compliance Officer | Yes (assigned businesses) | Yes | Within scope |
| Tax Intelligence Officer | Yes (all businesses) | Yes | Within scope |
| Audit Officer | Yes (all businesses) | Yes | Within scope |
| Super Administrator | Yes (all) | Yes | Yes |
| Stock Administrator | Inventory only | No | No |

---

## 10. Common Questions

**Q: Can TaxFlow directly access RRA tax declaration records?**
A: TaxFlow accesses authorized data sources only. Direct access to RRA tax declaration records requires a formally established integration. The current implementation uses data submitted through TaxFlow's own interfaces.

**Q: What if a business's EBM machine fails and sales are not recorded?**
A: EBM failure should be reported through the proper RRA channel. When EBM integration is active, known technical failures may be noted as context for reconciliation review. Officers review such circumstances before escalating.

**Q: Can a TaxFlow compliance concern lead directly to a penalty?**
A: No. TaxFlow concerns must go through the formal RRA tax assessment process before any penalty can be imposed. TaxFlow evidence supports but does not replace that process.

---

## 11. Related Knowledge Center Topics

- Stock Movement Rule — how inventory is tracked
- Supply Chain and Inventory — how transactions create audit trails
- AI-Powered Monitoring — how compliance gaps trigger alerts
- Administrative Roles — which officers handle tax compliance monitoring
`,
    },

    // ── 10. Administrative Roles ─────────────────────────────────────────
    {
        slug: "administrative-roles",
        title: "Administrative Roles and Responsibilities — Complete Reference",
        section: "roles",
        summary: "TaxFlow uses a principle-of-least-privilege role system. Each administrative role has specific permissions, responsibilities, and boundaries. No role automatically inherits all permissions — every access right is explicit and auditable.",
        tags: ["roles", "permissions", "rbac", "super-admin", "compliance", "customs", "stock"],
        content: `# Administrative Roles and Responsibilities — Complete Reference

## 1. Overview

TaxFlow operates on a **principle of least privilege**: every officer has access to exactly the information and tools needed for their authorized role — nothing more. No role automatically inherits all system capabilities.

This design ensures:
- Sensitive taxpayer data is accessible only to officers who genuinely need it.
- Administrative actions are traceable to specific authorized individuals.
- A compromise of one officer's account does not expose all system data.
- Accountability is clear for every consequential action.

> Every permission is enforced server-side. No client-supplied role claim is trusted. Attempting to access a resource without the proper permission generates an audit event.

---

## 2. Super Administrator

### Role Description
The Super Administrator holds the highest administrative authority within the TaxFlow platform. The Super Administrator is responsible for overall system governance, not day-to-day operational monitoring.

### Primary Responsibilities

| Area | Responsibilities |
|------|----------------|
| **Staff Management** | Create, edit, suspend, reactivate TF staff accounts; assign roles |
| **Trader Account Management** | Approve, reject, suspend, restore, deactivate trader accounts |
| **System Configuration** | Manage compliance thresholds, monitoring parameters, system settings |
| **Audit Oversight** | Access and review system-wide audit records |
| **Escalation Handling** | Handle cases escalated from other officers |
| **Knowledge Center Management** | Create, edit, publish, archive documentation |
| **Security Incidents** | Review and coordinate response to security events |
| **Policy Management** | Implement approved policy changes in system configuration |

### What Super Administrator Can Access

| Data | Access Level |
|------|-------------|
| All trader accounts | Full access (summary and detail) |
| All staff accounts | Full access |
| System configuration | Full access |
| Audit log (all events) | Full read access |
| All AI alerts and investigations | Full access |
| All supply chain records | Full read access |
| All import and customs records | Full read access |
| All compliance records | Full read access |
| Confidential manufacturing formulas | **NOT automatic** — requires specific permission grant |

### What Super Administrator Must NOT Do
- Take consequential action without documented justification (even Super Admin actions are audited).
- Independently cancel or deregister a TIN — this requires the formal RRA process.
- Access confidential manufacturing formulas without specific authorization and documented reason.
- Share system access credentials.
- Modify audit records.

---

## 3. Tax Compliance Officer

### Role Description
Compliance Officers monitor trader compliance with tax obligations and TaxFlow rules. They review alerts, investigate discrepancies, and initiate formal referrals for tax assessment.

### Primary Responsibilities

| Area | Responsibilities |
|------|----------------|
| **Compliance Monitoring** | Review trader compliance status; investigate alerts |
| **Reconciliation Review** | Compare purchase, sales, and inventory records |
| **Trader Inquiry** | Contact traders for clarification on discrepancies |
| **Case Management** | Open, manage, and resolve compliance cases |
| **Referral** | Refer confirmed concerns for formal tax assessment |
| **Reporting** | Generate compliance monitoring reports |

### Permitted Actions

| Action | Permitted? |
|--------|-----------|
| View trader compliance status | Yes |
| View supply chain records | Yes |
| View import records | Yes |
| Approve stock adjustments | No — refer to Stock Administrator |
| Approve trader accounts | No — refer to Super Admin |
| Access tax declaration records | Within authorized scope |
| Modify audit records | Never |

### Cases That Must Be Escalated
- Cases where formal tax assessment may be required.
- Cases involving possible criminal activity.
- Cases where the trader is a politically sensitive entity.
- Cases where another officer may have a conflict of interest.

---

## 4. Audit and Investigation Officer

### Role Description
Investigation Officers handle formally opened investigation cases. They have broader data access to gather evidence for specific investigations.

### Primary Responsibilities
- Review evidence for assigned investigation cases.
- Interview relevant parties (through approved channels).
- Examine full transaction and audit history for investigated businesses.
- Prepare investigation findings reports.
- Recommend authorized administrative actions based on findings.

### Additional Permissions (vs. Compliance Officer)
- Access to full transaction history (longer lookback period).
- Access to inter-business comparison (seller vs. buyer records for specific transactions).
- Access to AI alert history for the investigated business.
- Ability to freeze business activity pending investigation (with documented justification and senior authorization).

---

## 5. Tax Intelligence Officer

### Role Description
Intelligence Officers analyze patterns across the trader population to identify systemic risks, sector-wide compliance concerns, and emerging threats.

### Primary Responsibilities
- Analyze AI alert patterns across multiple businesses.
- Identify sector-specific compliance concerns.
- Monitor cross-business transaction networks.
- Develop risk intelligence reports for senior officers.
- Recommend enhanced monitoring for specific sectors or business types.

### Access Notes
Intelligence Officers have read access to aggregate and individual data needed for pattern analysis. They do not have authority to take account actions — they escalate to Compliance Officers or Super Admin.

---

## 6. Manufacturing Monitoring Officer

### Role Description
Manufacturing Officers specifically monitor production and manufacturing activities to ensure declared outputs match expectations and that products are not leaving production unrecorded.

### Primary Responsibilities
- Review manufacturing production plans and declarations.
- Analyze production efficiency ratios.
- Investigate manufacturing discrepancy alerts.
- Review material consumption records.
- Handle escalated production anomalies.

### Confidentiality Note
Standard Manufacturing Officers see **protected material identifiers** — not actual material names. Access to confidential manufacturing formulas requires a specific, separately authorized permission with documented justification per access session.

---

## 7. Customs and Import Officer

### Role Description
Customs Officers verify imported goods against declarations and record accurate inspection results.

### Primary Responsibilities
- Review import declarations assigned to their entry point.
- Conduct or coordinate physical inspection of imported goods.
- Record Customs-verified quantities.
- Document discrepancies between declared and actual quantities.
- Make clearance decisions (approve, reject, flag).
- Escalate suspicious imports.

### Critical Boundaries
- Must not alter the original importer's declaration (preserved as submitted).
- Must not approve imports without completing inspection documentation.
- Must not receive consideration from importers in connection with their duties.

---

## 8. Taxpayer Registration Officer

### Role Description
Registration Officers manage trader account applications, TIN verification, and account information updates.

### Primary Responsibilities
- Review and process new trader account applications.
- Verify TIN information.
- Process approved account information updates.
- Handle trader inquiries about their account.
- Escalate suspicious registration attempts.

### Permitted Actions

| Action | Permitted? |
|--------|-----------|
| View trader registration information | Yes |
| Approve new account applications | Yes |
| Update authorized fields (contact info, etc.) | Yes |
| Suspend accounts | Depends on scope — may require Super Admin |
| Deactivate accounts | No — Super Admin only |
| Modify tax records | No |

---

## 9. Stock and Inventory Administrator

### Role Description
Stock Administrators monitor inventory records, review stock adjustment requests, and investigate inventory reconciliation gaps.

### Primary Responsibilities
- Monitor trader inventory records for assigned businesses.
- Review and approve or reject stock adjustment requests.
- Investigate inventory reconciliation gaps.
- Review sell-through compliance.
- Handle purchasing eligibility queries.

---

## 10. Permission Comparison Table

| Permission | Super Admin | Compliance | Audit | Intelligence | Manufacturing | Customs | Registration | Stock |
|-----------|------------|-----------|-------|--------------|---------------|---------|--------------|-------|
| View all trader accounts | ✓ | ✓ | ✓ | ✓ | Mfg only | Import only | ✓ | ✓ |
| Approve trader accounts | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Suspend trader accounts | ✓ | Escalate | ✓* | ✗ | ✗ | ✗ | ✗ | ✗ |
| View supply chain | ✓ | ✓ | ✓ | ✓ | Mfg chain | Import chain | ✗ | ✓ |
| View import records | ✓ | ✓ | ✓ | ✓ | Inputs only | ✓ | ✗ | ✗ |
| Approve stock adjustments | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Access audit log | ✓ | Own cases | Own cases | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manage staff accounts | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| System configuration | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Confidential recipes | Requires specific grant | ✗ | Requires specific grant | ✗ | Requires specific grant | ✗ | ✗ | ✗ |

*With documented justification and senior authorization.

---

## 11. Common Questions

**Q: Can an officer hold multiple roles?**
A: Yes. A staff member can be assigned multiple roles, gaining the combined permissions of each. However, role assignments must be appropriate to their responsibilities and are audited.

**Q: What if an officer needs temporary access to something outside their role?**
A: Super Administrator can grant temporary specific permissions with documented justification. All grants and access events are logged.

**Q: Who can create new roles?**
A: Role definitions are managed at the system level. Super Administrator can assign existing roles to staff. Creating new role types requires a system change with appropriate authorization.

---

## 12. Related Knowledge Center Topics

- Security and Audit Trail — how roles and permissions are enforced and logged
- Account Management — how officer actions are audited
- AI-Powered Monitoring — how alerts are routed to appropriate officers
- About TaxFlow — the overall system design philosophy
`,
    },

    // ── 11. Account Management ───────────────────────────────────────────
    {
        slug: "account-management",
        title: "Trader Account Management — Complete Guide",
        section: "account-management",
        summary: "TaxFlow supports the full trader account lifecycle: application, verification, approval, review, suspension, restoration, and deactivation. Every sensitive action is documented with actor, reason, timestamp, and outcome.",
        tags: ["account", "suspension", "approval", "restoration", "audit", "lifecycle"],
        content: `# Trader Account Management — Complete Guide

## 1. Overview

Trader account management covers every aspect of a business's relationship with TaxFlow — from initial application through ongoing compliance, potential suspension, and eventual account closure.

Every consequential account action must be:
- Authorized by an officer with the appropriate permission.
- Documented with a clear reason.
- Recorded in the immutable audit trail.
- Communicated to the affected business through the appropriate channel.

---

## 2. The Account Lifecycle

~~~
[Application Submitted]
         ↓
[Identity & TIN Verification]
         ↓
[Document Review]
         ↓
   ┌─────┴─────┐
[Approved]  [Rejected]
   ↓
[Active Account]
   ↓
[Under Review] ←──────── [Compliance concern raised]
   ↓
   ┌────────┴────────┐
[Restored]      [Suspended]
                     ↓
              [Restored] or [Deactivated]
~~~

---

## 3. Account Status Definitions

| Status | Description | Business Capabilities |
|--------|-------------|----------------------|
| **Pending** | Application submitted; awaiting officer review | None — awaiting decision |
| **Active** | Account approved and in good standing | Full capabilities per account type |
| **Under Review** | Compliance or registration concern under investigation | May be limited — officer decision |
| **Suspended** | Administrative hold; business cannot trade | Suspended — cannot create or confirm transactions |
| **Restored** | Suspension lifted following resolution | Returns to Active |
| **Rejected** | Application refused | None — may reapply with corrected information |
| **Deactivated** | Permanent closure | None |

---

## 4. Account Approval Process

### New Account Application Review

**Step 1:** Officer receives application notification.

**Step 2:** Verify TIN:
- Confirm TIN exists in official registry.
- Confirm TIN is active (not suspended or deregistered).
- Confirm business name matches TIN record.
- Check for duplicate TaxFlow accounts for the same TIN.

**Step 3:** Review submitted documents:
- Business registration certificate.
- Proof of address.
- Contact information.
- Any required supporting documents for the account type.

**Step 4:** Determine account type:
- Manufacturer, Wholesaler, Retailer, Importer, or combination.
- Account type determines which modules are accessible.

**Step 5:** Record decision:
| Decision | When Appropriate |
|----------|----------------|
| Approve | All requirements met, TIN valid, documents satisfactory |
| Pend for information | Missing documents; ask applicant to provide |
| Reject | TIN invalid, fraudulent application, duplicate, insufficient documents |

**Step 6:** Notify the applicant of the decision.

---

## 5. Account Suspension

Account suspension is a significant action that must be used proportionately and with full documentation.

### When Suspension May Be Appropriate

- Serious unresolved compliance concern requiring a business pause pending investigation.
- Evidence of fraudulent activity in TaxFlow records.
- Request from a legally authorized authority.
- Trader has an active formal investigation case.
- TIN has been suspended or cancelled by RRA.

### When Suspension Is NOT Appropriate

- Routine monitoring alert without further investigation.
- Based solely on an AI alert without human review.
- Punitive action without documented justification.
- Retaliation for submitting a complaint.

### Suspension Process

**Step 1:** Confirm appropriate authorization level (required permission: account suspension).

**Step 2:** Review the basis for suspension — ensure it meets the documented criteria.

**Step 3:** Record the suspension in TaxFlow:
- Select "Suspend" action.
- Enter a clear, specific reason.
- Reference the supporting case or investigation number.
- Add supporting documentation references.

**Step 4:** The system records:
- Officer identity
- Previous account status
- New account status (Suspended)
- Reason provided
- Timestamp
- Reference to supporting evidence

**Step 5:** Notify the business through the authorized notification channel.

---

## 6. Account Restoration

Restoration lifts a suspension and returns the account to Active status.

### Conditions for Restoration

- The concern that led to suspension has been resolved.
- Required compliance actions have been completed.
- Formal investigation has concluded without adverse finding.
- A Senior Officer or Super Administrator has authorized restoration.
- The underlying TIN is active.

### Restoration Process

**Step 1:** Review the original suspension record.

**Step 2:** Confirm resolution criteria are met:
- Compliance concern resolved?
- Supporting documentation submitted?
- Investigation concluded?

**Step 3:** Record the restoration:
- Select "Restore" action.
- Enter the specific reason for restoration.
- Reference the resolution evidence.

**Step 4:** The system records the restoration event.

**Step 5:** Notify the business.

---

## 7. Account Information Updates — Authorized Workflow

### Scenario: Taxpayer Requests Phone Number Update

**Step 1:** Caller provides TIN and business name.

**Step 2:** Officer retrieves the account record.

**Step 3:** Officer verifies identity using the approved verification method:
- Asks caller to confirm registered address.
- Confirms additional identification details.
- Does not proceed if identity cannot be verified.

**Step 4:** Officer reviews the requested change — is an email/phone update within the officer's authorized scope? (Yes, for Registration Officers and Super Admin.)

**Step 5:** Officer makes the update in the system.

**Step 6:** System records:
- Previous value: old phone number
- New value: new phone number
- Changed by: officer identity
- Reason: "Taxpayer request — identity verified per procedure"
- Timestamp

**Step 7:** Officer notifies taxpayer of successful update (using a confirmed channel).

### Fields That May Be Updated by Authorized Officers

| Field | Who Can Update |
|-------|---------------|
| Contact phone number | Registration Officer, Super Admin |
| Contact email address | Registration Officer, Super Admin |
| Business contact address | Registration Officer, Super Admin |
| Account type | Super Admin only |
| Account status | Authorized officers per scope |
| Assigned roles | Super Admin only |
| TIN or registered name | Cannot be changed in TaxFlow — must follow formal RRA process |

---

## 8. Account Deactivation

Permanent deactivation closes a TaxFlow account. This is typically used when:
- A business has formally ceased operations.
- The TIN has been deregistered by RRA.
- A formal legal order requires account closure.

**Deactivation requires:**
- Super Administrator authorization.
- Documented justification.
- Reference to the supporting reason (business closure certificate, RRA deregistration record, etc.).

> Deactivation is irreversible. Once deactivated, an account cannot be restored through TaxFlow. A new application would be required if the business resumes under the same TIN.

---

## 9. Audit Trail Requirements — Account Actions

Every sensitive account action must generate an audit record containing:

| Audit Field | Description |
|-------------|-------------|
| **Actor** | Officer who performed the action (identity, role) |
| **Action type** | APPROVED, REJECTED, SUSPENDED, RESTORED, UPDATED, DEACTIVATED |
| **Target account** | Business TIN and name |
| **Previous status** | Account state before the action |
| **New status** | Account state after the action |
| **Reason** | Specific documented reason |
| **Supporting reference** | Case number, document reference, or authority |
| **Timestamp** | Precise date and time |
| **Notification** | Whether and how the business was notified |

Audit records are immutable. They cannot be deleted or modified after creation.

---

## 10. What Officers Must Never Do

- Take account action based solely on an AI alert without reviewing supporting evidence.
- Suspend an account without proper authorization and documented justification.
- Restore an account without confirming the original concern is resolved.
- Update sensitive account information without identity verification.
- Modify or delete audit records.
- Take account action against a business due to personal conflict or improper external influence.

---

## 11. Common Questions

**Q: Can a business see the reason for their suspension?**
A: Business-facing notification content is managed according to communication policy. The officer-recorded reason is in the internal audit trail and may be shared through authorized channels.

**Q: Can a business appeal a suspension?**
A: Yes. The business should follow the authorized appeal process. During a pending appeal, the suspension typically remains in place pending review.

**Q: Who can override a suspension?**
A: Super Administrator can override any suspension. Senior Compliance Officers may also have this authority depending on their role configuration.

---

## 12. Related Knowledge Center Topics

- TIN Verification — the foundation of account identity
- Security and Audit Trail — how account actions are protected and logged
- Administrative Roles — which officers can perform which account actions
- AI-Powered Monitoring — how alerts may lead to account reviews (but not automatic action)
`,
    },

    // ── 12. Security ──────────────────────────────────────────────────────
    {
        slug: "security-audit-trail",
        title: "Security, Data Protection, and Audit Trail — Complete Guide",
        section: "security",
        summary: "TaxFlow protects sensitive taxpayer information through role-based access control, secure authentication, audit logging, and data integrity rules. Every significant action is traceable to a specific officer with timestamps, reasons, and evidence.",
        tags: ["security", "rbac", "audit", "authentication", "data-protection", "integrity", "accountability"],
        content: `# Security, Data Protection, and Audit Trail — Complete Guide

## 1. Overview

TaxFlow handles sensitive taxpayer information, commercial records, and administrative decisions that have real consequences for businesses and individuals. The security model is designed to ensure that:

- Only authorized people can access sensitive information.
- Every significant action is permanently recorded.
- Errors can be investigated and corrected.
- Misconduct can be identified and attributed.
- Taxpayer data is protected from unauthorized disclosure.

---

## 2. Role-Based Access Control (RBAC)

### Core Principles

**Explicit permissions:** No role automatically inherits access to everything. Every permission must be explicitly granted.

**Server-side enforcement:** Permissions are enforced at the server. A user who cannot see data through the UI also cannot retrieve it via API.

**Least privilege:** Officers receive only the permissions necessary for their role.

**Multiple roles:** A staff member can hold multiple roles, each adding specific permissions.

**Audit of access:** Attempts to access resources without permission are logged as security events.

### How Permissions Work

Every server action, API endpoint, and page in TaxFlow checks:
1. Is the user authenticated? (Valid session required.)
2. Does the user hold the required role or permission for this operation?
3. Is the target data within the user's authorized scope?

If any check fails, access is denied and the attempt is logged.

### Role Examples

| Role | Example Permission | Example Access Denied |
|------|-------------------|----------------------|
| Compliance Officer | View trader compliance status | Modify system configuration |
| Manufacturing Officer | View production records | Approve stock adjustments |
| Customs Officer | Record import verification | View domestic B2B transactions |
| Stock Administrator | Approve inventory adjustments | View tax declaration data |
| Registration Officer | Approve new accounts | Access confidential recipe data |

---

## 3. Authentication

TaxFlow uses a secure session-based authentication system:

| Feature | Implementation |
|---------|---------------|
| **Session tokens** | Server-validated on every request |
| **Token storage** | HttpOnly cookies (not accessible to browser scripts) |
| **Failed attempts** | Rate-limited to prevent brute force attacks |
| **Session expiry** | Sessions expire after a configured inactivity period |
| **Concurrent sessions** | Managed to prevent unauthorized sharing |

### Staff Account Security Requirements

- Staff accounts must be created by Super Administrator — no self-registration.
- Each staff member must have their own unique account — no shared credentials.
- Sharing login credentials is a serious policy violation and security risk.
- Staff should log out when leaving their workstation.

---

## 4. The Audit Trail

The audit trail is TaxFlow's accountability backbone. Every significant action generates a permanent, immutable audit record.

### Events That Are Always Logged

| Category | Specific Events |
|----------|----------------|
| **Authentication** | Staff sign-in, sign-out, failed attempts |
| **Account management** | Trader account approval, rejection, suspension, restoration, deactivation |
| **Staff management** | Staff account creation, role changes, suspension, deletion |
| **Configuration changes** | Compliance threshold changes, monitoring parameter changes |
| **Data access** | Access to confidential recipe data, sensitive taxpayer records |
| **Case management** | Alert creation, assignment, investigation opening, case closure |
| **Knowledge Center** | Article creation, editing, publishing, archiving |
| **Import decisions** | Customs approval, rejection, flagging decisions |
| **Inventory management** | Stock adjustment approvals, reconciliation actions |
| **AI queries** | AI assistant queries, Knowledge Center AI usage |

### What Each Audit Record Contains

| Field | Description |
|-------|-------------|
| **Who** | Officer's staff user ID, name, and role at time of action |
| **What** | Action type code (e.g., ACCOUNT_SUSPENDED, THRESHOLD_CHANGED) |
| **When** | Precise timestamp (server time) |
| **Target** | The specific record affected (business TIN, configuration key, etc.) |
| **Previous state** | The state before the action (where applicable) |
| **New state** | The state after the action |
| **Reason** | The officer's documented reason (where required) |
| **Metadata** | Additional relevant details specific to the action type |

### Audit Record Immutability

Audit records cannot be:
- Deleted by any user, including Super Administrator.
- Modified after creation.
- Accessed for modification through any TaxFlow interface.

If an audit record contains an error (e.g., the reason was incorrectly entered), the correct process is to create a correction record — not to modify the original.

---

## 5. Data Protection Principles

### Sensitive Data Categories

| Category | Protection Level |
|----------|----------------|
| **Taxpayer TIN and identity** | Restricted to authorized officers with specific need |
| **Tax amounts and compliance status** | Restricted to officers with data access permission |
| **Business transaction records** | Accessible to authorized officers per their scope |
| **Manufacturing production data** | Accessible to manufacturing officers; formulas restricted |
| **Confidential manufacturing formulas** | Highest restriction — specific permission required |
| **Officer account credentials** | Never disclosed; stored as secure hashes |

### Data Access Principles

**Need to know:** Officers access only the data needed for their specific, current task.

**Purpose limitation:** Data accessed for one investigation cannot be freely shared for unrelated purposes.

**Data minimization:** Queries retrieve only the specific fields needed, not full records when partial records suffice.

**Authorized disclosure:** Taxpayer information may only be disclosed to authorized parties through proper procedures.

### Confidential Manufacturing Formula Access

This category has the strongest protection:

1. Standard officer access shows protected identifiers (◆◆◆◆◆◆) instead of actual material names.
2. Specific permission must be explicitly granted by Super Administrator.
3. Each access session requires documented justification.
4. Access is logged with the officer, reason, timestamp, and specific records accessed.
5. Super Administrator status does NOT automatically grant this permission.

---

## 6. Data Integrity

TaxFlow protects the accuracy and completeness of its records through:

| Measure | Purpose |
|---------|---------|
| **Immutable records** | Audit logs, Customs verification records, confirmed receipts cannot be altered |
| **Transaction safety** | Database operations use transactions to prevent partial updates |
| **Server-side validation** | All inputs are validated on the server regardless of client-side checks |
| **Idempotency protection** | Critical operations are protected against duplicate submissions |
| **Foreign key constraints** | Records cannot be orphaned from their parent contexts |

### Correcting Errors in Records

When a genuine error exists in a record:
1. A correction request must be submitted with supporting evidence.
2. An authorized officer reviews the correction.
3. The correction is applied with a full audit record (original value, corrected value, reason, officer, timestamp).
4. The original record is preserved — corrections are additive, not replacement.

---

## 7. Security Incidents

### What Constitutes a Security Incident

| Incident Type | Examples |
|-------------|---------|
| **Unauthorized access** | Attempt to access resources without proper permission |
| **Credential compromise** | Shared credentials, stolen passwords |
| **Data exfiltration** | Unauthorized extraction of taxpayer data |
| **Audit log tampering** | Attempt to delete or modify audit records |
| **Privilege escalation** | Attempting to gain permissions beyond assigned role |
| **Suspicious access patterns** | Unusual volume of sensitive record access |

### Officer Response to a Suspected Security Incident

**Step 1 — Identify:** Recognize and document the suspicious event (what was observed, when, where in the system).

**Step 2 — Preserve:** Do not attempt to investigate by modifying system records. Preserve the evidence in its current state.

**Step 3 — Report:** Immediately escalate to the designated security officer or Super Administrator. Do not delay while attempting to resolve it independently.

**Step 4 — Isolate:** If the incident involves a compromised staff account, Super Administrator should suspend the account pending investigation.

**Step 5 — Investigate:** A designated officer reviews audit logs, access patterns, and affected records.

**Step 6 — Contain and Remediate:** Take authorized steps to prevent further unauthorized access.

**Step 7 — Document:** Record the full incident response with timeline, affected records, actions taken, and resolution.

**Step 8 — Review:** After resolution, review whether system controls should be strengthened.

---

## 8. Accountability Framework

TaxFlow's accountability framework is built on three principles:

### 1. Attribution
Every action in TaxFlow is attributed to a specific, authenticated staff member. Anonymous actions do not exist. "The system did it" is never an acceptable explanation for a consequential action.

### 2. Documentation
Every consequential action requires a documented reason. Brief, uninformative reasons (such as "as required" or "per instruction") are insufficient. Reasons should explain the specific basis for the action.

### 3. Transparency
The audit trail is available to authorized reviewers. Officers should conduct themselves as if every action will be reviewed — because it may be.

---

## 9. What Officers Must Never Do

- Share login credentials with colleagues.
- Access taxpayer or trader data without an authorized reason.
- Attempt to modify or delete audit records.
- Access confidential manufacturing formula data without specific authorization.
- Disclose taxpayer information to unauthorized parties.
- Take consequential actions without following the proper authorization workflow.
- Ignore a suspected security incident.

---

## 10. Common Questions

**Q: Can Super Administrator delete audit records?**
A: No. Audit records are immutable. No user, including Super Administrator, can delete them through any TaxFlow interface.

**Q: What if an officer made a mistake in a record and wants to correct it?**
A: Submit a correction request with supporting evidence. An authorized officer approves the correction. The original record and the correction are both preserved.

**Q: What happens if an officer's credentials are compromised?**
A: The Super Administrator should immediately suspend the compromised account, review the audit trail for unauthorized actions during the compromise period, and initiate the security incident response process.

**Q: How long are audit records retained?**
A: Audit records are retained according to the applicable data retention policy. The current implementation preserves all audit records indefinitely.

---

## 11. Related Knowledge Center Topics

- Administrative Roles — the role and permission structure
- Account Management — how account actions are audited
- AI-Powered Monitoring — how alert activity is logged
- About TaxFlow — the overall design philosophy of accountability
`,
    },
];
