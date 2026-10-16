# TaxFlow Smart Customs

## Merchant workflow
1. A registered manufacturer, wholesaler, or retailer records the goods they expect to bring into Rwanda, country of purchase/origin, supplier (optional), expected return date, estimated value, and currency.
2. TaxFlow generates a customs declaration reference if the merchant does not enter one.
3. On arrival, the merchant submits the quantity they report bringing and an invoice/import document reference plus supporting PDF.
4. The declaration appears in the RRA Customs Verification workspace for authorized compliance/audit officers.
5. The officer records the quantity physically inspected and optional notes. Only the officer-entered inspected quantity is added to inventory when the officer confirms clearance.
6. The merchant sees the reported quantity, customs-verified quantity, inspection note, and status in their dashboard.

## Roles and controls
- Merchant users can create declarations, submit arrival details, and view their own declaration history.
- Only active RRA staff with the existing compliance/audit clearance can confirm or reject submitted declarations.
- Confirmation is transactionally guarded against duplicate activation, writes an audit record, and notifies the merchant.
- The inspected quantity is stored separately from the merchant-reported quantity.

## Database migration
Before deploying code that references the new columns, apply db/migrations/taxflow/0007_smart_customs_inspection.sql to the TaxFlow database. It uses ADD COLUMN IF NOT EXISTS and preserves existing declaration records. Do not run any seed script against production. Verify the migration in a staging database first and take the normal database backup before production changes.

## Scope and limitations
This is a TaxFlow workflow prototype. A generated TaxFlow reference is not an official customs registration number or QR code. It does not connect to RRA/customs systems, determine legal duties, or replace official customs procedures. Any official integration, required-declaration rules, valuation rules, and clearance decisions require authorization and confirmation from the relevant government authorities.
