# PROPOSAL: AN INTEGRATED DIGITAL SYSTEM TO COMPLEMENT EBM FOR REAL-TIME TAX AND PRODUCT FLOW TRACKING IN RWANDA

---

## 1. Introduction

The Electronic Billing Machine (EBM) system has played a significant role in improving tax compliance in Rwanda. However, despite its effectiveness, several challenges still exist, including:

- Partial declaration of purchased goods by traders
- Traders operating without TIN numbers
- Tax evasion through undeclared stock
- Limited visibility of product movement across the supply chain

To address these gaps, this proposal introduces a **digital system designed to complement (not replace) EBM**, focusing on **tracking products and taxes from factories to final customers in real time**.

---

## 2. Overall Objective of the System

The main objectives of the system are to:

- Track goods throughout the entire supply chain
- Ensure traders pay taxes before being allowed to restock
- Provide RRA with real-time visibility of products and tax obligations
- Prevent traders without TIN/ID from participating in wholesale trade
- Reduce tax evasion and informal trading

**The system does not replace EBM**; it strengthens EBM by controlling **product flow and stock accountability**.

---

## 3. System Structure and User Categories

The system is divided into **three main categories**, each with a **dedicated dashboard**:

- **Category 1: Manufacturer / Factory**
- **Category 2: Wholesaler / Distributor**
- **Category 3: Retailer (Final Customer Seller)**

All users must register using a **TIN number or National ID**.

---

## 4. User Dashboards and Their Functions

### 4.1 Manufacturer (Factory) Dashboard

**Main Functions:**

- Register produced goods
- Record quantities and wholesale prices
- Sell goods to wholesalers or retailers

**After a Sale:**

- The system automatically:
  - Records sold quantities
  - Updates remaining stock
  - Calculates tax due
  - Sends data instantly to RRA

**Dashboard Displays:**

- Total produced goods
- Total sold goods
- Remaining stock
- Tax payable
- Tax payment status

---

### 4.2 Wholesaler / Distributor Dashboard

**Key Rules:**

- A wholesaler can buy from factories or other wholesalers
- A wholesaler can only restock if **95% of previous tax obligations are paid**

**Before Restocking:**

1. Seller enters buyer’s **TIN or ID**
2. System verifies tax compliance
3. Status shown:
   - *Eligible to Purchase*
   - *Not Eligible – Outstanding Tax*

**After Purchasing Goods:**

- Cannot change:
  - Purchase quantity
  - Purchase price
- Can only:
  - Set **selling price**

Once the selling price is entered:

- The system (and RRA dashboard) **automatically calculates the tax**
- Tax amount becomes visible immediately

**During Sales:**

- Total quantity purchased
- Quantity sold
- Remaining stock
- Total tax generated
- Tax already paid
- Tax balance

**Wholesaler Dashboard Example Table:**

| Product | Purchased | Sold | Remaining | Selling Price | Tax Due     |
| ------- | --------- | ---- | --------- | ------------- | ----------- |
| Soap    | 1,000     | 720  | 280       | 650 RWF       | 117,000 RWF |
| Sugar   | 500       | 120  | 380       | 1,200 RWF     | 108,000 RWF |

Tax Calculation:

- **Tax Due = Selling Price * Quantity Sold * Tax Rate**
- Tax Rate = 18%

Example:

- Soap: 1,000 * 650 * 0.18 = 117,000 RWF
- Sugar: 500 * 1,200 * 0.18 = 108,000 RWF

---

### 4.3 Retailer (Final Customer Seller) Dashboard

**Main Functions:**

- Buy goods from wholesalers or factories
- Sell goods only to final customers

**During Sales:**

- Record:
  - Customer name
  - Quantity sold

**System Behavior:**

- Remaining stock updates instantly
- Tax is calculated automatically
- Retailer cannot:
  - Alter purchase quantities
  - Modify purchase prices

Only **RRA** has authority to modify records

**Retailer Sales Monitoring Table Example:**

| Product | Opening Stock | Sold Today | Remaining | Unit Price | Tax Accrued |
| ------- | ------------- | ---------- | --------- | ---------- | ----------- |
| Sugar   | 500           | 120        | 380       | 1,200 RWF  | 72,000 RWF  |
| Soap    | 1,000         | 10         | 990       | 800 RWF    | 48,000 RWF  |

---

## 5. Real-Time Tax Calculation and Visibility

At every stage:

- When selling price is entered
- When goods are sold
- When stock changes

👉 The system instantly:

- Calculates applicable tax
- Displays tax on:
  - Trader dashboard
  - RRA dashboard

---

## 6. Product Flow Example

**Example 1: Factory → Wholesaler → Retailer → Final Customer**

| Level | Seller       | Buyer        | Product | Quantity | Price   |
| ----- | ------------ | ------------ | ------- | -------- | ------- |
| 1     | Factory      | Wholesaler A | Soap    | 1,000    | 500 RWF |
| 2     | Wholesaler A | Retailer B   | Soap    | 1,000    | 650 RWF |
| 3     | Retailer B   | Customer     | Soap    | 10       | 800 RWF |

---

## 7. Offline and Online Functionality

- Transactions are recorded offline
- Data is stored locally
- Once internet is available, records sync automatically with RRA servers

---

## 8. Tax Payment Through the Dashboard

- View tax due in real time
- Pay directly via:
  - Mobile Money
  - Bank transfer
- Receive instant compliance updates

---

## 9. Imported Goods Management

- Importers declare expected quantities before import
- Upon arrival, actual quantities are confirmed
- Stock activated in the system
- Prevents under-declaration

---

## 10. Benefits of the System

**For RRA**

- Real-time product and tax monitoring
- Reduced tax evasion
- Reliable and verifiable data

**For Traders**

- Clear tax obligations
- Fair trading environment
- Simplified compliance

**For Government**

- Increased tax revenue
- Formalized trade
- Stronger digital economy

---

## 11. Detailed Dashboard Design and Real-Time Visibility

### 11.1 Manufacturer (Factory) Dashboard

- Record: Product name, Quantity supplied, Supply price, Buyer’s TIN/ID
- Automatic:
  - Tax calculation
  - Updates dashboard and RRA
  - Updates remaining stock

### 11.2 Wholesaler / Distributor Dashboard

- Purchase quantity and price **locked**
- Enter intended selling price
- Automatic:
  - Tax calculation
  - Updates dashboard and RRA

### 11.3 Retailer (Final Customer Seller) Dashboard

- Purchase quantity and price **locked**
- Set final selling price
- Automatic tax calculation
- Updates dashboard and RRA

### 11.4 RRA Central Dashboard

- Real-time visibility across all traders
- Stock movement, sales, taxes, compliance
- Ability to adjust quantities or prices if justified

---

## 12. Key Advantages

- No manual tax declaration
- No hidden stock
- No delayed reporting
- Automatic enforcement of compliance
- Continuous visibility for traders and RRA

---

## 13. Error Handling & Dispute Resolution

### 13.1 Transaction Disputes

**Dispute Initiation:**

- 48-hour window after transaction confirmation
- Filed through dashboard with reference number
- Documentation: receipt photo, delivery evidence, explanation
- Temporary hold on disputed funds

## 14. Dispute Resolution Infrastructure

- Digital Evidence System: timestamps, geo-tagging, blockchain-style ledger
- Resolution Centers: offices + mobile teams for remote areas
- Comprehensive Audit Trail: complete transaction history, RRA oversight
- Proactive Monitoring: automated alerts for unusual activity
- Trader Support: 24/7 helpline, account managers, training sessions

## 15. Conclusion

By integrating real-time dashboards with automatic tax calculation and live stock tracking, this system ensures every product sold is visible, traceable, and taxable. It complements EBM and strengthens control over market entry, movement, and tax generation at each stage.

**Prepared By**

- HATEGEKIMANA Confiance
- GATETE Elias
