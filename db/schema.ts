import { relations, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, real, jsonb, index, uniqueIndex, bigint, check, numeric } from 'drizzle-orm/pg-core';

// auth models

// Better Auth's database-backed limiter keeps limits shared across instances.
export const rateLimit = pgTable(
  'rate_limit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [index('rate_limit_last_request_idx').on(table.lastRequest)],
);

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    username: text('username').unique(), // Mapped to TIN for better-auth login
    displayUsername: text('display_username'), // Case-preserving display name (username plugin)
    nationalId: text('national_id').unique(), // 16-digit national ID
    tinNumber: text('tin_number').unique(),
    businessName: text('business_name'), // Auto-fetched from tin_db during signup
    phoneNumber: text('phone_number').unique(), // From phoneNumber plugin
    phoneNumberVerified: boolean('phone_number_verified').default(false),
    role: text('role').notNull().default('retailer'), // manufacturer, wholesaler, retailer, rra_staff
    businessType: text('business_type').notNull().default('registered_business'), // registered_business, institution, government, large_bulk_buyer
    clearanceStatus: text('clearance_status').default('pending').notNull(),
    // "pending" | "approved" | "under_review" | "suspended"
    // New traders start as "pending" - RRA staff must approve before they can trade
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('user_role_idx').on(table.role), index('user_clearance_status_idx').on(table.clearanceStatus)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// ---------------------------------------------------------------------------
// RRA Staff
// ---------------------------------------------------------------------------

export const rraStaff = pgTable(
  'rra_staff',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    staffId: text('staff_id').notNull().unique(),
    department: text('department'),
    clearanceLevel: text('clearance_level').notNull(),
    assignedBy: text('assigned_by').references(() => user.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('rra_staff_userId_idx').on(table.userId),
    index('rra_staff_staffId_idx').on(table.staffId),
    uniqueIndex('rra_staff_staff_id_ci_unique').on(sql`lower(${table.staffId})`),
  ],
);

// A worker may hold several predefined RRA role bundles. clearanceLevel stays
// as the primary/legacy role while this table records every effective role.
export const rraStaffRole = pgTable(
  'rra_staff_role',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    staffRecordId: text('staff_record_id').notNull().references(() => rraStaff.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    assignedBy: text('assigned_by').references(() => user.id),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('rra_staff_role_staff_role_uniq').on(table.staffRecordId, table.role),
    index('rra_staff_role_role_idx').on(table.role),
  ],
);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const product = pgTable(
  'product',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    unit: text('unit').notNull(), // "kg", "piece", "liter", etc.
    categoryCode: text('category_code'), // RRA tax classification
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('product_created_by_idx').on(table.createdByUserId)],
);

// A business-owned customer directory. This stores customer details entered by
// that business; a record is not proof of TIN validity or RRA registration.
export const customer = pgTable(
  'customer',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    customerType: text('customer_type').notNull().default('individual'),
    tinNumber: text('tin_number'),
    phone: text('phone'),
    email: text('email'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index('customer_business_active_name_idx').on(table.businessId, table.isActive, table.name),
    uniqueIndex('customer_business_tin_uniq').on(table.businessId, table.tinNumber),
    check('customer_type_check', sql`${table.customerType} IN ('individual', 'business', 'institution')`),
    check('customer_tin_format_check', sql`${table.tinNumber} IS NULL OR ${table.tinNumber} ~ '^[0-9]{9}$'`),
  ],
);

// ---------------------------------------------------------------------------
// Stock — one row per (business, product) pair
// ---------------------------------------------------------------------------

export const stock = pgTable(
  'stock',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id')
      .notNull()
      .references(() => user.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    quantity: real('quantity').notNull().default(0),
    price: integer('price'), // unit price in RWF (nullable for legacy rows)
    source: text('source'), // e.g. "manufactured", "imported", "purchased"
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('stock_business_idx').on(table.businessId),
    uniqueIndex('stock_business_product_uniq').on(table.businessId, table.productId),
  ],
);

// Append-only inventory evidence. Legacy stock quantities are opening balances;
// only movements recorded after this table is introduced have verified provenance.
export const stockMovement = pgTable(
  'stock_movement',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id').notNull().references(() => user.id),
    productId: text('product_id').notNull().references(() => product.id),
    quantityDelta: real('quantity_delta').notNull(),
    quantityBefore: real('quantity_before').notNull(),
    quantityAfter: real('quantity_after').notNull(),
    movementType: text('movement_type').notNull(),
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    actorUserId: text('actor_user_id').references(() => user.id),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('stock_movement_business_product_created_idx').on(table.businessId, table.productId, table.createdAt),
    index('stock_movement_source_idx').on(table.sourceType, table.sourceId),
  ],
);

// Effective-dated sell-through policy. Rows are immutable history; a change is
// represented by inserting a new row rather than rewriting prior decisions.
export const stockSellThroughThreshold = pgTable(
  'stock_sell_through_threshold',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    scopeType: text('scope_type').notNull(), // default | category | product
    scopeKey: text('scope_key').notNull(), // '*' for default, otherwise category code or product ID
    thresholdPercent: real('threshold_percent').notNull(),
    effectiveAt: timestamp('effective_at').notNull(),
    reason: text('reason').notNull(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('stock_sell_through_threshold_scope_effective_idx').on(table.scopeType, table.scopeKey, table.effectiveAt),
    check('stock_sell_through_threshold_scope_check', sql`${table.scopeType} IN ('default', 'category', 'product')`),
    check('stock_sell_through_threshold_key_check', sql`(${table.scopeType} = 'default' AND ${table.scopeKey} = '*') OR (${table.scopeType} IN ('category', 'product') AND ${table.scopeKey} <> '*')`),
    check('stock_sell_through_threshold_percent_check', sql`${table.thresholdPercent} >= 0 AND ${table.thresholdPercent} <= 100`),
  ],
);

// A cycle describes the prospective recorded-stock cohort used for one
// business/product pair. A legacy opening balance starts in review until an
// authorized officer attests the recorded TaxFlow quantity.
export const stockSellThroughCycle = pgTable(
  'stock_sell_through_cycle',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id').notNull().references(() => user.id),
    productId: text('product_id').notNull().references(() => product.id),
    baselineQuantity: real('baseline_quantity').notNull(),
    cycleStartedAt: timestamp('cycle_started_at').notNull(),
    baselineStatus: text('baseline_status').notNull(), // needs_review | ledger_verified
    baselineVerifiedByUserId: text('baseline_verified_by_user_id').references(() => user.id),
    baselineVerifiedAt: timestamp('baseline_verified_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stock_sell_through_cycle_business_product_uniq').on(table.businessId, table.productId),
    index('stock_sell_through_cycle_business_idx').on(table.businessId),
    check('stock_sell_through_cycle_baseline_check', sql`${table.baselineQuantity} >= 0`),
    check('stock_sell_through_cycle_status_check', sql`${table.baselineStatus} IN ('needs_review', 'ledger_verified')`),
  ],
);

// Restock requests record the sell-through decision, not receipt of goods.
// Exception review is separately mutable and every decision is audit-logged.
export const stockRestockRequest = pgTable(
  'stock_restock_request',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id').notNull().references(() => user.id),
    productId: text('product_id').notNull().references(() => product.id),
    requestedQuantity: real('requested_quantity').notNull(),
    requestedByUserId: text('requested_by_user_id').notNull().references(() => user.id),
    idempotencyKey: text('idempotency_key').notNull(),
    cycleId: text('cycle_id').notNull().references(() => stockSellThroughCycle.id),
    cycleStartedAt: timestamp('cycle_started_at').notNull(),
    thresholdId: text('threshold_id').references(() => stockSellThroughThreshold.id),
    thresholdPercent: real('threshold_percent'), // immutable decision snapshot; null means no active policy
    baselineQuantity: real('baseline_quantity').notNull(),
    cohortQuantity: real('cohort_quantity').notNull(),
    qualifyingSalesQuantity: real('qualifying_sales_quantity').notNull(),
    requiredSalesQuantity: real('required_sales_quantity').notNull(),
    sellThroughPercent: real('sell_through_percent'),
    eligibilityStatus: text('eligibility_status').notNull(), // eligible | blocked | review_required
    eligibilityReason: text('eligibility_reason').notNull(),
    sourceEvidenceRefs: text('source_evidence_refs').notNull(), // bounded JSON refs to movement and accepted-transaction rows used
    evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
    exceptionReason: text('exception_reason'),
    exceptionStatus: text('exception_status').notNull().default('none'), // none | pending | approved | rejected
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id),
    reviewedAt: timestamp('reviewed_at'),
    reviewReason: text('review_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stock_restock_request_business_idempotency_uniq').on(table.businessId, table.idempotencyKey),
    index('stock_restock_request_status_created_idx').on(table.eligibilityStatus, table.createdAt),
    index('stock_restock_request_exception_created_idx').on(table.exceptionStatus, table.createdAt),
    index('stock_restock_request_business_product_created_idx').on(table.businessId, table.productId, table.createdAt),
    check('stock_restock_request_quantity_check', sql`${table.requestedQuantity} > 0 AND ${table.requestedQuantity} <= 1000000000`),
    check('stock_restock_request_owner_check', sql`${table.requestedByUserId} = ${table.businessId}`),
    check('stock_restock_request_quantities_check', sql`${table.baselineQuantity} >= 0 AND ${table.cohortQuantity} >= 0 AND ${table.qualifyingSalesQuantity} >= 0 AND ${table.requiredSalesQuantity} >= 0`),
    check('stock_restock_request_eligibility_check', sql`${table.eligibilityStatus} IN ('eligible', 'blocked', 'review_required')`),
    check('stock_restock_request_exception_check', sql`${table.exceptionStatus} IN ('none', 'pending', 'approved', 'rejected')`),
    check('stock_restock_request_threshold_check', sql`${table.thresholdPercent} IS NULL OR (${table.thresholdPercent} >= 0 AND ${table.thresholdPercent} <= 100)`),
    check('stock_restock_request_sell_through_check', sql`${table.sellThroughPercent} IS NULL OR (${table.sellThroughPercent} >= 0 AND ${table.sellThroughPercent} <= 100)`),
    check('stock_restock_request_exception_reason_check', sql`${table.exceptionStatus} = 'none' OR ${table.exceptionReason} IS NOT NULL`),
    check('stock_restock_request_review_pair_check', sql`(${table.reviewedByUserId} IS NULL) = (${table.reviewedAt} IS NULL)`),
  ],
);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const transaction = pgTable(
  'transaction',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sellerId: text('seller_id')
      .notNull()
      .references(() => user.id),
    buyerId: text('buyer_id').references(() => user.id), // null for retail → consumer
    buyerName: text('buyer_name'), // final consumer name (retailer sales only)
    customerId: text('customer_id').references(() => customer.id, { onDelete: 'set null' }),
    transactionType: text('transaction_type').notNull().default('STANDARD_B2B_SALE'), // STANDARD_B2B_SALE | DIRECT_BULK_SALE | RETAIL_SALE
    buyerType: text('buyer_type').notNull().default('registered_business'), // individual_consumer | registered_business | institution | government | large_bulk_buyer
    invoiceReference: text('invoice_reference'),
    deliveryInformation: jsonb('delivery_information').$type<{ address?: string; schedule?: string; notes?: string }>(),
    paymentStatus: text('payment_status').notNull().default('unpaid'), // unpaid | partial | paid
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    quantity: real('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(), // RWF
    totalAmount: integer('total_amount').notNull(), // quantity × unitPrice
    vatAmount: integer('vat_amount').notNull(), // totalAmount × 0.18
    vatRateBasisPoints: integer('vat_rate_basis_points'), // null for legacy rows; snapshot at sale time
    pricingMode: text('pricing_mode'), // 'exclusive' | 'inclusive'; null for legacy rows
    status: text('status').notNull().default('pending'),
    // "pending" | "confirmed" | "rejected" | "completed"
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    confirmedAt: timestamp('confirmed_at'),
    rejectedAt: timestamp('rejected_at'),
  },
  (table) => [
    index('txn_seller_idx').on(table.sellerId),
    index('txn_buyer_idx').on(table.buyerId),
    index('txn_status_idx').on(table.status),
    index('txn_product_idx').on(table.productId),
  ],
);

// B2B inventory holds. Creation removes the full reserved quantity from seller
// available stock. Order acceptance retains the hold; full dispatch converts it.
// Pending-only cancellation/expiry releases it exactly once before acceptance.
export const stockReservation = pgTable(
  'stock_reservation',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().unique().references(() => transaction.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull().references(() => product.id),
    quantity: real('quantity').notNull(),
    sellerId: text('seller_id').notNull().references(() => user.id),
    buyerId: text('buyer_id').notNull().references(() => user.id),
    status: text('status').notNull().default('active'),
    reservedAt: timestamp('reserved_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    releasedAt: timestamp('released_at'),
  },
  (table) => [
    index('stock_reservation_seller_status_expires_idx').on(table.sellerId, table.status, table.expiresAt),
    index('stock_reservation_buyer_status_expires_idx').on(table.buyerId, table.status, table.expiresAt),
    check('stock_reservation_status_check', sql`${table.status} IN ('active', 'converted', 'released', 'expired', 'cancelled')`),
    check('stock_reservation_quantity_check', sql`${table.quantity} > 0`),
  ],
);

// A business is represented by its verified owner account (the existing user
// row). Representatives use their own verified user account; this table does
// not create a second business identity or trust client-supplied business data.
export const businessRepresentative = pgTable(
  'business_representative',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id').notNull().references(() => user.id),
    representativeUserId: text('representative_user_id').notNull().references(() => user.id),
    status: text('status').notNull().default('pending'),
    invitedByUserId: text('invited_by_user_id').notNull().references(() => user.id),
    invitedAt: timestamp('invited_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_representative_business_user_uniq').on(table.businessId, table.representativeUserId),
    index('business_representative_user_status_idx').on(table.representativeUserId, table.status),
    check('business_representative_status_check', sql`${table.status} IN ('pending', 'active', 'revoked')`),
    check('business_representative_not_owner_check', sql`${table.businessId} <> ${table.representativeUserId}`),
  ],
);

// B2B acceptance is distinct from physical dispatch and measured receipt.
// Existing transaction rows intentionally receive no fabricated acceptance.
export const b2bOrderAcceptance = pgTable(
  'b2b_order_acceptance',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().unique().references(() => transaction.id),
    buyerBusinessId: text('buyer_business_id').notNull().references(() => user.id),
    actorUserId: text('actor_user_id').notNull().references(() => user.id),
    acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  },
  (table) => [index('b2b_order_acceptance_buyer_time_idx').on(table.buyerBusinessId, table.acceptedAt)],
);

export const b2bDispatch = pgTable(
  'b2b_dispatch',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().references(() => transaction.id),
    sellerBusinessId: text('seller_business_id').notNull().references(() => user.id),
    actorUserId: text('actor_user_id').notNull().references(() => user.id),
    quantity: real('quantity').notNull(),
    dispatchReference: text('dispatch_reference'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('b2b_dispatch_transaction_key_uniq').on(table.transactionId, table.idempotencyKey),
    index('b2b_dispatch_transaction_created_idx').on(table.transactionId, table.createdAt),
    uniqueIndex('b2b_dispatch_business_reference_uniq').on(table.sellerBusinessId, table.dispatchReference),
    check('b2b_dispatch_quantity_check', sql`${table.quantity} > 0`),
  ],
);

export const b2bReceipt = pgTable(
  'b2b_receipt',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    dispatchId: text('dispatch_id').notNull().references(() => b2bDispatch.id),
    transactionId: text('transaction_id').notNull().references(() => transaction.id),
    buyerBusinessId: text('buyer_business_id').notNull().references(() => user.id),
    actorUserId: text('actor_user_id').notNull().references(() => user.id),
    quantityReceived: real('quantity_received').notNull(),
    acceptedQuantity: real('accepted_quantity').notNull(),
    damagedQuantity: real('damaged_quantity').notNull().default(0),
    rejectedQuantity: real('rejected_quantity').notNull().default(0),
    disputedQuantity: real('disputed_quantity').notNull().default(0),
    notes: text('notes'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('b2b_receipt_dispatch_key_uniq').on(table.dispatchId, table.idempotencyKey),
    index('b2b_receipt_transaction_created_idx').on(table.transactionId, table.createdAt),
    check('b2b_receipt_quantity_positive_check', sql`${table.quantityReceived} > 0`),
    check('b2b_receipt_classification_nonnegative_check', sql`${table.acceptedQuantity} >= 0 AND ${table.damagedQuantity} >= 0 AND ${table.rejectedQuantity} >= 0 AND ${table.disputedQuantity} >= 0`),
    check('b2b_receipt_classification_total_check', sql`abs(${table.acceptedQuantity} + ${table.damagedQuantity} + ${table.rejectedQuantity} + ${table.disputedQuantity} - ${table.quantityReceived}) < 0.000001`),
  ],
);

// ---------------------------------------------------------------------------
// Transaction Items — line items within a transaction (multi-product support)
// ---------------------------------------------------------------------------

export const transactionItem = pgTable(
  'transaction_item',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'cascade' }),
    productName: text('product_name').notNull(),
    quantity: real('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(), // RWF
    totalPrice: integer('total_price').notNull(), // quantity × unitPrice
    vatAmount: integer('vat_amount').notNull(), // totalPrice × 0.18
  },
  (table) => [index('txn_item_txn_idx').on(table.transactionId)],
);

// ---------------------------------------------------------------------------
// VAT Records
// ---------------------------------------------------------------------------

export const vatRecord = pgTable(
  'vat_record',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transaction.id),
    businessId: text('business_id')
      .notNull()
      .references(() => user.id),
    vatType: text('vat_type').notNull(), // "input" | "output"
    amount: integer('amount').notNull(), // RWF
    isFrozen: boolean('is_frozen').notNull().default(false),
    period: text('period'), // e.g. "2026-Q1", "2026-03" for period-based filing
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('vat_business_idx').on(table.businessId),
    index('vat_txn_idx').on(table.transactionId),
    index('vat_business_type_idx').on(table.businessId, table.vatType),
  ],
);

// ---------------------------------------------------------------------------
// Tax Payments — actual payments made to RRA
// ---------------------------------------------------------------------------

export const taxPayment = pgTable(
  'tax_payment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id')
      .notNull()
      .references(() => user.id),
    amount: integer('amount').notNull(), // RWF
    method: text('method').notNull(), // "mobile_money", "bank_transfer", "cash"
    reference: text('reference').unique(), // payment reference / receipt number
    idempotencyKey: text('idempotency_key'),
    status: text('status').default('confirmed').notNull(), // "pending", "confirmed", "rejected"
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('tax_payment_business_idx').on(table.businessId),
    index('tax_payment_status_idx').on(table.status),
    uniqueIndex('tax_payment_business_idempotency_uniq').on(table.businessId, table.idempotencyKey),
  ],
);

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    action: text('action').notNull(),
    // e.g. "TRANSACTION_CREATED", "CLEARANCE_UPDATED"
    targetType: text('target_type'), // "transaction", "user", "product"
    targetId: text('target_id'),
    metadata: text('metadata'), // JSON string for extra context
    beforeState: jsonb('before_state').$type<Record<string, unknown>>(),
    afterState: jsonb('after_state').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'), // source IP for financial audit trail
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_user_idx').on(table.userId),
    index('audit_action_idx').on(table.action),
    index('audit_target_idx').on(table.targetType, table.targetId),
  ],
);

// ---------------------------------------------------------------------------
// RRA Case Management
// ---------------------------------------------------------------------------

export const rraCase = pgTable(
  'rra_case',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    traderId: text('trader_id').notNull().references(() => user.id),
    title: text('title').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('normal'),
    assignedStaffId: text('assigned_staff_id').references(() => rraStaff.id, { onDelete: 'set null' }),
    createdByStaffId: text('created_by_staff_id').references(() => rraStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    closedAt: timestamp('closed_at'),
  },
  (table) => [
    index('rra_case_status_updated_idx').on(table.status, table.updatedAt),
    index('rra_case_trader_created_idx').on(table.traderId, table.createdAt),
    index('rra_case_assigned_status_idx').on(table.assignedStaffId, table.status),
  ],
);

export const rraCaseEvent = pgTable(
  'rra_case_event',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    caseId: text('case_id').notNull().references(() => rraCase.id, { onDelete: 'cascade' }),
    actorStaffId: text('actor_staff_id').references(() => rraStaff.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    note: text('note'),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('rra_case_event_case_created_idx').on(table.caseId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// System Configuration — admin-editable key-value settings
// ---------------------------------------------------------------------------

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedBy: text('updated_by').references(() => user.id),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notification = pgTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    type: text('type').notNull(),
    // "txn_incoming", "txn_confirmed", "txn_rejected", "compliance_alert", "system"
    title: text('title').notNull(),
    message: text('message').notNull(),
    link: text('link'), // optional path to navigate to, e.g. "/dashboard/pending"
    read: boolean('read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('notification_user_idx').on(table.userId),
    index('notification_read_idx').on(table.userId, table.read),
  ],
);

// ---------------------------------------------------------------------------
// Import Declarations — for imported goods management (§9)
// ---------------------------------------------------------------------------

export const importDeclaration = pgTable(
  'import_declaration',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id')
      .notNull()
      .references(() => user.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    productionMaterialId: text('production_material_id').references(() => productionMaterial.id),
    expectedQuantity: real('expected_quantity').notNull(),
    actualQuantity: real('actual_quantity'), // filled by trader on arrival
    status: text('status').notNull().default('pending'),
    // "pending" → "submitted" → "activated" | "rejected"
    customsRef: text('customs_ref'), // customs reference number
    originCountry: text('origin_country'), // country of origin
    invoiceRef: text('invoice_ref'), // invoice or import document reference
    supportingDoc: text('supporting_doc'), // description of supporting documents
    reviewedById: text('reviewed_by_id').references(() => user.id), // RRA officer who confirmed/rejected

    // ── Smart Customs enhancement fields ─────────────────────────────────────
    declarationRef: text('declaration_ref').unique(), // unique pre-travel reference, e.g. DECL-XXXXXXXX
    supplier: text('supplier'),                        // exporter / supplier name
    estimatedValue: real('estimated_value'),            // declared value in chosen currency
    currency: text('currency').default('USD'),          // ISO-4217 currency code
    expectedReturnDate: timestamp('expected_return_date'), // expected arrival date
    reviewerNote: text('reviewer_note'),                // RRA officer inspection note
    inspectedQuantity: real('inspected_quantity'),      // physically verified quantity (set by RRA)
    discrepancyFlag: boolean('discrepancy_flag').notNull().default(false), // >10% variance detected
    discrepancyPct: real('discrepancy_pct'),            // |expected - inspected| / expected * 100

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('import_business_idx').on(table.businessId),
    index('import_status_idx').on(table.status),
    index('import_declaration_ref_idx').on(table.declarationRef),
    index('import_discrepancy_flag_idx').on(table.discrepancyFlag),
  ],
);

// ---------------------------------------------------------------------------
// Disputes — for dispute resolution (§13)
// ---------------------------------------------------------------------------

export const dispute = pgTable(
  'dispute',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transaction.id),
    filedById: text('filed_by_id')
      .notNull()
      .references(() => user.id),
    counterpartyId: text('counterparty_id')
      .notNull()
      .references(() => user.id),
    referenceNumber: text('reference_number').notNull().unique(),
    reason: text('reason').notNull(),
    evidence: text('evidence'), // file path or text description

    // Status flow: filed → acknowledged/contested → under_review → resolved/dismissed
    status: text('status').notNull().default('filed'),

    // Counterparty response
    counterpartyResponse: text('counterparty_response').notNull().default('pending'),
    // "pending" | "acknowledged" | "contested"
    counterpartyNote: text('counterparty_note'), // counterparty's response note

    // RRA resolution
    rraAction: text('rra_action'),
    // "undo_transaction" | "adjust_amount" | "uphold_dispute" | "dismiss"
    resolution: text('resolution'), // admin resolution notes
    rraOfficialNote: text('rra_official_note'), // official communication sent to both parties
    resolvedById: text('resolved_by_id').references(() => user.id),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('dispute_transaction_idx').on(table.transactionId),
    index('dispute_filed_by_idx').on(table.filedById),
    index('dispute_counterparty_idx').on(table.counterpartyId),
    index('dispute_status_idx').on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  rraStaff: one(rraStaff),
  products: many(product),
  stock: many(stock),
  salesAseller: many(transaction, { relationName: 'seller' }),
  purchasesAsBuyer: many(transaction, { relationName: 'buyer' }),
  vatRecords: many(vatRecord),
  auditLogs: many(auditLog),
  notifications: many(notification),
  taxPayments: many(taxPayment),
  importDeclarations: many(importDeclaration),
  disputesFiled: many(dispute, { relationName: 'filedBy' }),
  disputesCounterparty: many(dispute, { relationName: 'counterparty' }),
  disputesResolved: many(dispute, { relationName: 'resolvedBy' }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const rraStaffRelations = relations(rraStaff, ({ one, many }) => ({
  user: one(user, {
    fields: [rraStaff.userId],
    references: [user.id],
  }),
  roleAssignments: many(rraStaffRole),
}));

export const rraStaffRoleRelations = relations(rraStaffRole, ({ one }) => ({
  staff: one(rraStaff, {
    fields: [rraStaffRole.staffRecordId],
    references: [rraStaff.id],
  }),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [product.createdByUserId],
    references: [user.id],
  }),
  stock: many(stock),
  transactions: many(transaction),
  importDeclarations: many(importDeclaration),
}));

export const stockRelations = relations(stock, ({ one }) => ({
  business: one(user, {
    fields: [stock.businessId],
    references: [user.id],
  }),
  product: one(product, {
    fields: [stock.productId],
    references: [product.id],
  }),
}));

export const transactionRelations = relations(transaction, ({ one, many }) => ({
  seller: one(user, {
    fields: [transaction.sellerId],
    references: [user.id],
    relationName: 'seller',
  }),
  buyer: one(user, {
    fields: [transaction.buyerId],
    references: [user.id],
    relationName: 'buyer',
  }),
  product: one(product, {
    fields: [transaction.productId],
    references: [product.id],
  }),
  items: many(transactionItem),
  vatRecords: many(vatRecord),
  disputes: many(dispute),
}));

export const transactionItemRelations = relations(transactionItem, ({ one }) => ({
  transaction: one(transaction, {
    fields: [transactionItem.transactionId],
    references: [transaction.id],
  }),
}));

export const vatRecordRelations = relations(vatRecord, ({ one }) => ({
  transaction: one(transaction, {
    fields: [vatRecord.transactionId],
    references: [transaction.id],
  }),
  business: one(user, {
    fields: [vatRecord.businessId],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));

export const taxPaymentRelations = relations(taxPayment, ({ one }) => ({
  business: one(user, {
    fields: [taxPayment.businessId],
    references: [user.id],
  }),
}));

export const importDeclarationRelations = relations(importDeclaration, ({ one }) => ({
  business: one(user, {
    fields: [importDeclaration.businessId],
    references: [user.id],
  }),
  product: one(product, {
    fields: [importDeclaration.productId],
    references: [product.id],
  }),
}));

export const disputeRelations = relations(dispute, ({ one }) => ({
  transaction: one(transaction, {
    fields: [dispute.transactionId],
    references: [transaction.id],
  }),
  filedBy: one(user, {
    fields: [dispute.filedById],
    references: [user.id],
    relationName: 'filedBy',
  }),
  counterparty: one(user, {
    fields: [dispute.counterpartyId],
    references: [user.id],
    relationName: 'counterparty',
  }),
  resolvedBy: one(user, {
    fields: [dispute.resolvedById],
    references: [user.id],
    relationName: 'resolvedBy',
  }),
}));

// ---------------------------------------------------------------------------
// Staff Bulletin Board — internal RRA announcements (Weakness 14)
// ---------------------------------------------------------------------------

export const staffBulletin = pgTable(
  'staff_bulletin',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    title: text('title').notNull(),
    content: text('content').notNull(),
    priority: text('priority').notNull().default('info'), // info | important | urgent
    department: text('department'), // null = all departments
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('staff_bulletin_author_idx').on(t.authorId), index('staff_bulletin_created_idx').on(t.createdAt)],
);

export const staffBulletinRelations = relations(staffBulletin, ({ one }) => ({
  author: one(user, {
    fields: [staffBulletin.authorId],
    references: [user.id],
  }),
}));

// ---------------------------------------------------------------------------
// Support Tickets — taxpayer service requests (Weakness 6)
// ---------------------------------------------------------------------------

export const supportTicket = pgTable(
  'support_ticket',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    traderId: text('trader_id')
      .references(() => user.id),
    threadType: text('thread_type').notNull().default('taxpayer'), // taxpayer | staff
    category: text('category').notNull().default('general'), // general | tax_query | account_issue | system_bug | other
    routingCategory: text('routing_category'),
    routingDepartment: text('routing_department'),
    routingReason: text('routing_reason'),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('open'), // open | in_progress | resolved | closed
    priority: text('priority').notNull().default('medium'), // low | medium | high
    assignedToId: text('assigned_to_id').references(() => user.id),
    resolution: text('resolution'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => [
    index('support_ticket_trader_idx').on(t.traderId),
    index('support_ticket_status_idx').on(t.status),
    index('support_ticket_assigned_idx').on(t.assignedToId),
      index('support_ticket_category_status_idx').on(t.category, t.status, t.updatedAt),
    index('support_ticket_routing_status_idx').on(t.routingCategory, t.routingDepartment, t.status, t.updatedAt),
      check('support_ticket_thread_type_check', sql`${t.threadType} IN ('taxpayer', 'staff')`),
  ],
);

// Messages are append-only. The legacy support_ticket.description remains the
// original opening message and is backfilled into this table by migration.
export const supportTicketMessage = pgTable(
  'support_ticket_message',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    ticketId: text('ticket_id').notNull().references(() => supportTicket.id, { onDelete: 'cascade' }),
      // Kept as a compatibility alias for older deployed messaging code.
      authorId: text('author_id').references(() => user.id),
    senderUserId: text('sender_user_id').notNull().references(() => user.id),
    senderType: text('sender_type').notNull(), // taxpayer | staff
    body: text('body').notNull(),
    clientMessageId: text('client_message_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('support_ticket_message_chronology_idx').on(table.ticketId, table.createdAt, table.id),
    index('support_ticket_message_sender_idx').on(table.senderUserId, table.createdAt),
      uniqueIndex('support_ticket_message_idempotency_uniq').on(table.senderUserId, table.clientMessageId)
        .where(sql`${table.clientMessageId} IS NOT NULL`),
      check('support_ticket_message_sender_type_check', sql`${table.senderType} IN ('taxpayer', 'staff')`),
  ],
);

// This table stores participant membership and per-user read/archive state.
// Queue visibility is decided separately from this row by server-side routing
// rules; opening an unassigned queue item never grants permanent access.
export const supportTicketParticipant = pgTable(
  'support_ticket_participant',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    ticketId: text('ticket_id').notNull().references(() => supportTicket.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    participantType: text('participant_type').notNull(), // taxpayer | staff | queue
    lastReadAt: timestamp('last_read_at'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('support_ticket_participant_ticket_user_uniq').on(table.ticketId, table.userId),
    index('support_ticket_participant_user_read_idx').on(table.userId, table.lastReadAt),
      check('support_ticket_participant_type_check', sql`${table.participantType} IN ('taxpayer', 'staff', 'queue')`),
  ],
);

export const supportTicketRelations = relations(supportTicket, ({ one }) => ({
  trader: one(user, {
    fields: [supportTicket.traderId],
    references: [user.id],
    relationName: 'ticketTrader',
  }),
  assignedTo: one(user, {
    fields: [supportTicket.assignedToId],
    references: [user.id],
    relationName: 'ticketAssignee',
  }),
}));


// ---------------------------------------------------------------------------
// Production Batches — manufacturers declare production quantities per period
// ---------------------------------------------------------------------------

export const productionBatch = pgTable(
  'production_batch',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    manufacturerId: text('manufacturer_id')
      .notNull()
      .references(() => user.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    batchReference: text('batch_reference').notNull().unique(), // e.g. BATCH-SOAP-2026-000123
    declaredQuantity: real('declared_quantity').notNull(),
    unitPrice: integer('unit_price').notNull().default(0),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull().default(0),
    recipeVersionId: text('recipe_version_id'),
    plannedOutputQuantity: real('planned_output_quantity'),
    productionValidationStatus: text('production_validation_status').notNull().default('not_applicable'),
    recipeInputHash: text('recipe_input_hash'),
    materialPlanId: text('material_plan_id').references(() => productionMaterialPlan.id),
    materialReviewStatus: text('material_review_status').notNull().default('not_required'),
    materialReviewNote: text('material_review_note'),
    materialReviewedById: text('material_reviewed_by_id').references(() => user.id),
    materialReviewedAt: timestamp('material_reviewed_at'),
    materialPostedAt: timestamp('material_posted_at'),
    idempotencyKey: text('idempotency_key'),
    openingStock: real('opening_stock').default(0),
    approvedLosses: real('approved_losses').default(0),
    status: text('status').default('declared'), // 'declared' | 'reconciled' | 'independently_supported'
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('prod_batch_manufacturer_idx').on(table.manufacturerId),
    index('prod_batch_product_idx').on(table.productId),
    index('prod_batch_status_idx').on(table.status),
    uniqueIndex('prod_batch_ref_uniq').on(table.batchReference),
    uniqueIndex('prod_batch_idempotency_key_uniq').on(table.idempotencyKey),
    uniqueIndex('prod_batch_material_plan_uniq').on(table.materialPlanId).where(sql`${table.materialPlanId} IS NOT NULL`),
  ],
);

// Confidential manufacturer recipe data is stored outside the general
// production batch read model. Recipe versions and their lines are immutable.
export const productionMaterial = pgTable(
  'production_material',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    manufacturerId: text('manufacturer_id').notNull().references(() => user.id),
    materialCode: text('material_code').notNull(),
    confidentialName: text('confidential_name').notNull(),
    unit: text('unit').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_material_manufacturer_code_uniq').on(table.manufacturerId, table.materialCode),
    uniqueIndex('production_material_manufacturer_name_uniq').on(table.manufacturerId, sql`lower(${table.confidentialName})`),
    index('production_material_manufacturer_idx').on(table.manufacturerId),
  ],
);

export const productionRecipe = pgTable(
  'production_recipe',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    manufacturerId: text('manufacturer_id').notNull().references(() => user.id),
    productId: text('product_id').notNull().references(() => product.id),
    recipeCode: text('recipe_code').notNull(),
    version: integer('version').notNull(),
    outputQuantity: real('output_quantity').notNull(),
    yieldToleranceBasisPoints: integer('yield_tolerance_basis_points').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id),
  },
  (table) => [
    uniqueIndex('production_recipe_manufacturer_product_version_uniq').on(table.manufacturerId, table.productId, table.version),
    uniqueIndex('production_recipe_manufacturer_code_version_uniq').on(table.manufacturerId, table.recipeCode, table.version),
    index('production_recipe_manufacturer_product_idx').on(table.manufacturerId, table.productId),
  ],
);

export const productionRecipeMaterial = pgTable(
  'production_recipe_material',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: text('recipe_version_id').notNull().references(() => productionRecipe.id),
    materialId: text('material_id').notNull().references(() => productionMaterial.id),
    quantity: real('quantity').notNull(),
    consumptionToleranceBasisPoints: integer('consumption_tolerance_basis_points'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_recipe_material_recipe_material_uniq').on(table.recipeVersionId, table.materialId),
    index('production_recipe_material_recipe_idx').on(table.recipeVersionId),
  ],
);

export const productionBatchMaterialUsage = pgTable(
  'production_batch_material_usage',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productionBatchId: text('production_batch_id').notNull().references(() => productionBatch.id),
    recipeMaterialId: text('recipe_material_id').notNull().references(() => productionRecipeMaterial.id),
    materialId: text('material_id').notNull().references(() => productionMaterial.id),
    plannedQuantity: real('planned_quantity').notNull(),
    actualQuantity: real('actual_quantity').notNull(),
    consumptionToleranceBasisPoints: integer('consumption_tolerance_basis_points'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_batch_material_usage_batch_line_uniq').on(table.productionBatchId, table.recipeMaterialId),
    index('production_batch_material_usage_batch_idx').on(table.productionBatchId),
    index('production_batch_material_usage_material_idx').on(table.materialId),
  ],
);

// Raw-material accounting is intentionally separate from ordinary product stock.
// Quantities use PostgreSQL numeric strings so ledger arithmetic is exact.
export const productionMaterialPlan = pgTable(
  'production_material_plan',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    manufacturerId: text('manufacturer_id').notNull().references(() => user.id),
    productId: text('product_id').notNull().references(() => product.id),
    recipeVersionId: text('recipe_version_id').notNull().references(() => productionRecipe.id),
    plannedOutputQuantity: numeric('planned_output_quantity', { precision: 24, scale: 6, mode: 'string' }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id),
    status: text('status').notNull().default('planned'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_material_plan_manufacturer_key_uniq').on(table.manufacturerId, table.idempotencyKey),
    index('production_material_plan_manufacturer_created_idx').on(table.manufacturerId, table.createdAt),
    check('production_material_plan_output_positive', sql`${table.plannedOutputQuantity} > 0`),
    check('production_material_plan_status_check', sql`${table.status} IN ('planned', 'in_progress', 'completed', 'cancelled')`),
  ],
);

export const productionMaterialPlanLine = pgTable(
  'production_material_plan_line',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    planId: text('plan_id').notNull().references(() => productionMaterialPlan.id),
    recipeMaterialId: text('recipe_material_id').notNull().references(() => productionRecipeMaterial.id),
    materialId: text('material_id').notNull().references(() => productionMaterial.id),
    plannedQuantity: numeric('planned_quantity', { precision: 24, scale: 6, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_material_plan_line_uniq').on(table.planId, table.recipeMaterialId),
    index('production_material_plan_line_material_idx').on(table.materialId),
    check('production_material_plan_line_quantity_positive', sql`${table.plannedQuantity} > 0`),
  ],
);

export const productionMaterialReceipt = pgTable(
  'production_material_receipt',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    manufacturerId: text('manufacturer_id').notNull().references(() => user.id),
    materialId: text('material_id').notNull().references(() => productionMaterial.id),
    origin: text('origin').notNull(),
    importDeclarationId: text('import_declaration_id').references(() => importDeclaration.id),
    transactionId: text('transaction_id').references(() => transaction.id),
    supplierReference: text('supplier_reference'),
    evidenceReference: text('evidence_reference').notNull(),
    unit: text('unit').notNull(),
    quantity: numeric('quantity', { precision: 24, scale: 6, mode: 'string' }).notNull(),
    status: text('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull().references(() => user.id),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id),
    reviewedAt: timestamp('reviewed_at'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_material_receipt_owner_key_uniq').on(table.manufacturerId, table.idempotencyKey),
    uniqueIndex('production_material_receipt_import_uniq').on(table.importDeclarationId),
    index('production_material_receipt_status_created_idx').on(table.status, table.createdAt),
    index('production_material_receipt_manufacturer_created_idx').on(table.manufacturerId, table.createdAt),
    check('production_material_receipt_origin_check', sql`${table.origin} IN ('import', 'domestic', 'opening_balance')`),
    check('production_material_receipt_status_check', sql`${table.status} IN ('pending', 'verified', 'rejected')`),
    check('production_material_receipt_quantity_positive', sql`${table.quantity} > 0`),
    check('production_material_receipt_source_check', sql`(${table.origin} = 'import' AND ${table.importDeclarationId} IS NOT NULL AND ${table.transactionId} IS NULL) OR (${table.origin} = 'domestic' AND ${table.transactionId} IS NOT NULL AND ${table.importDeclarationId} IS NULL) OR (${table.origin} = 'opening_balance' AND ${table.importDeclarationId} IS NULL AND ${table.transactionId} IS NULL)`),
  ],
);

export const productionMaterialMovement = pgTable(
  'production_material_movement',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    manufacturerId: text('manufacturer_id').notNull().references(() => user.id),
    materialId: text('material_id').notNull().references(() => productionMaterial.id),
    movementType: text('movement_type').notNull(),
    quantityDelta: numeric('quantity_delta', { precision: 24, scale: 6, mode: 'string' }).notNull(),
    quantityBefore: numeric('quantity_before', { precision: 24, scale: 6, mode: 'string' }).notNull(),
    quantityAfter: numeric('quantity_after', { precision: 24, scale: 6, mode: 'string' }).notNull(),
    receiptId: text('receipt_id').references(() => productionMaterialReceipt.id),
    productionBatchId: text('production_batch_id').references(() => productionBatch.id),
    batchUsageId: text('batch_usage_id').references(() => productionBatchMaterialUsage.id),
    sourceReference: text('source_reference'),
    actorUserId: text('actor_user_id').notNull().references(() => user.id),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_material_movement_receipt_uniq').on(table.receiptId),
    uniqueIndex('production_material_movement_usage_uniq').on(table.batchUsageId),
    index('production_material_movement_material_created_idx').on(table.manufacturerId, table.materialId, table.createdAt),
    check('production_material_movement_type_check', sql`${table.movementType} IN ('receipt', 'consumption', 'adjustment')`),
    check('production_material_movement_nonzero_check', sql`${table.quantityDelta} <> 0`),
    check('production_material_movement_balance_check', sql`${table.quantityAfter} = ${table.quantityBefore} + ${table.quantityDelta}`),
  ],
);

// ---------------------------------------------------------------------------
// Stock Adjustments — approved stock corrections with audit trail
// ---------------------------------------------------------------------------

export const stockAdjustment = pgTable(
  'stock_adjustment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id')
      .notNull()
      .references(() => user.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    adjustmentType: text('adjustment_type').notNull(), // 'damage' | 'loss' | 'correction' | 'return' | 'opening_stock'
    quantityDelta: real('quantity_delta').notNull(), // positive = add, negative = remove
    reason: text('reason').notNull(),
    approvedById: text('approved_by_id').references(() => user.id), // nullable
    batchReference: text('batch_reference'), // nullable, links to productionBatch.batchReference
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('stock_adj_business_idx').on(table.businessId),
    index('stock_adj_product_idx').on(table.productId),
    index('stock_adj_type_idx').on(table.adjustmentType),
  ],
);

// ---------------------------------------------------------------------------
// AI Findings — persistent AI-detected findings with review lifecycle
// ---------------------------------------------------------------------------

export const aiFinding = pgTable(
  'ai_finding',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    findingType: text('finding_type').notNull(),
    // 'inventory_discrepancy' | 'dispatch_mismatch' | 'duplicate_transaction' |
    // 'unusual_quantity' | 'price_anomaly' | 'tax_inconsistency' |
    // 'production_discrepancy' | 'data_quality'
    severity: text('severity').notNull(), // 'info' | 'warning' | 'critical'
    businessId: text('business_id').references(() => user.id), // nullable — some findings are system-level
    productId: text('product_id').references(() => product.id), // nullable
    transactionIds: text('transaction_ids'), // JSON array of related transaction IDs
    observedValue: real('observed_value'),
    expectedValue: real('expected_value'),
    difference: real('difference'),
    differenceUnit: text('difference_unit'), // 'units' | 'rwf' | 'percent'
    explanation: text('explanation').notNull(),
    evidenceRefs: text('evidence_refs'), // JSON: { transactionIds[], batchRef?, stockIds[] }
    detectionMethod: text('detection_method').notNull(), // 'deterministic' | 'statistical' | 'ai'
    reviewStatus: text('review_status').default('open'), // 'open' | 'under_review' | 'resolved' | 'dismissed' | 'disputed'
    assignedReviewerId: text('assigned_reviewer_id').references(() => user.id), // nullable
    resolutionNotes: text('resolution_notes'),
    resolvedAt: timestamp('resolved_at'),
    modelVersion: text('model_version'), // e.g. 'reconciliation-v1'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('ai_finding_business_idx').on(table.businessId),
    index('ai_finding_type_idx').on(table.findingType),
    index('ai_finding_severity_idx').on(table.severity),
    index('ai_finding_review_status_idx').on(table.reviewStatus),
    index('ai_finding_created_idx').on(table.createdAt),
  ],
);

// Immutable point-in-time comparison evidence captured when a production
// declaration is recorded. Findings remain in ai_finding for the existing
// officer review lifecycle; this row preserves the reproducible comparison.
export const productionHistoryComparison = pgTable(
  'production_history_comparison',
  {
    id: text('id').primaryKey(),
    productionBatchId: text('production_batch_id').notNull().references(() => productionBatch.id),
    manufacturerId: text('manufacturer_id').notNull().references(() => user.id),
    productId: text('product_id').notNull().references(() => product.id),
    recipeVersionId: text('recipe_version_id').references(() => productionRecipe.id),
    ruleVersion: text('rule_version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_history_comparison_batch_uniq').on(table.productionBatchId),
    index('production_history_comparison_manufacturer_created_idx').on(table.manufacturerId, table.createdAt),
    index('production_history_comparison_product_created_idx').on(table.productId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Risk Assessments — stored risk scores per trader per period
// ---------------------------------------------------------------------------

export const riskAssessment = pgTable(
  'risk_assessment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id')
      .notNull()
      .references(() => user.id),
    assessmentDate: timestamp('assessment_date').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    overallScore: integer('overall_score').notNull(), // 0-100
    riskLevel: text('risk_level').notNull(), // 'low' | 'medium' | 'high' | 'critical'
    indicatorScores: text('indicator_scores').notNull(),
    // JSON: { priceDeviation, taxCompliance, transactionPatterns, stockAccuracy,
    //         historicalFlags, inventoryDiscrepancy, dispatchMismatch }
    findingIds: text('finding_ids'), // JSON array of aiFinding IDs that contributed
    scoringMethod: text('scoring_method').default('rules-v1'),
    dataCompleteness: integer('data_completeness'), // 0-100%
    reviewStatus: text('review_status').default('pending'), // 'pending' | 'reviewed' | 'actioned'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('risk_assessment_business_idx').on(table.businessId),
    index('risk_assessment_date_idx').on(table.assessmentDate),
    index('risk_assessment_level_idx').on(table.riskLevel),
  ],
);

// ---------------------------------------------------------------------------
// AI Audit Log — AI-specific request/response audit trail
// ---------------------------------------------------------------------------

export const aiAuditLog = pgTable(
  'ai_audit_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requestedById: text('requested_by_id')
      .notNull()
      .references(() => user.id),
    taskType: text('task_type').notNull(),
    // 'risk_score' | 'anomaly_detection' | 'revenue_forecast' |
    // 'audit_recommendation' | 'assistant_query' | 'reconciliation'
    referencedBusinessId: text('referenced_business_id'), // nullable
    referencedEntityIds: text('referenced_entity_ids'), // JSON array
    modelProvider: text('model_provider'), // e.g. 'anthropic', 'google', 'rules-engine'
    modelVersion: text('model_version'),
    findingIds: text('finding_ids'), // JSON array of generated findings
    reviewStatus: text('review_status').default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ai_audit_log_requested_by_idx').on(table.requestedById),
    index('ai_audit_log_task_type_idx').on(table.taskType),
    index('ai_audit_log_created_idx').on(table.createdAt),
  ],
);

// Feedback stores review metadata only; chat prompts and responses are never persisted here.
export const aiFeedback = pgTable(
  'ai_feedback',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    submittedById: text('submitted_by_id').notNull().references(() => user.id),
    staffRole: text('staff_role').notNull(),
    messageHash: text('message_hash').notNull(),
    rating: text('rating').notNull(),
    issueCategory: text('issue_category'),
    reviewStatus: text('review_status').notNull().default('pending'),
    reviewOutcome: text('review_outcome'),
    reviewedById: text('reviewed_by_id').references(() => user.id),
    reviewedAt: timestamp('reviewed_at'),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ai_feedback_submitter_message_unique').on(table.submittedById, table.messageHash),
    index('ai_feedback_status_created_idx').on(table.reviewStatus, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations for new Phase 2 tables
// ---------------------------------------------------------------------------

export const productionBatchRelations = relations(productionBatch, ({ one }) => ({
  manufacturer: one(user, {
    fields: [productionBatch.manufacturerId],
    references: [user.id],
    relationName: 'productionBatchManufacturer',
  }),
  product: one(product, {
    fields: [productionBatch.productId],
    references: [product.id],
  }),
  recipeVersion: one(productionRecipe, {
    fields: [productionBatch.recipeVersionId],
    references: [productionRecipe.id],
  }),
}));

export const productionMaterialRelations = relations(productionMaterial, ({ one }) => ({
  manufacturer: one(user, { fields: [productionMaterial.manufacturerId], references: [user.id] }),
}));

export const productionRecipeRelations = relations(productionRecipe, ({ one, many }) => ({
  manufacturer: one(user, { fields: [productionRecipe.manufacturerId], references: [user.id] }),
  product: one(product, { fields: [productionRecipe.productId], references: [product.id] }),
  materials: many(productionRecipeMaterial),
}));

export const productionRecipeMaterialRelations = relations(productionRecipeMaterial, ({ one }) => ({
  recipe: one(productionRecipe, { fields: [productionRecipeMaterial.recipeVersionId], references: [productionRecipe.id] }),
  material: one(productionMaterial, { fields: [productionRecipeMaterial.materialId], references: [productionMaterial.id] }),
}));

export const productionBatchMaterialUsageRelations = relations(productionBatchMaterialUsage, ({ one }) => ({
  batch: one(productionBatch, { fields: [productionBatchMaterialUsage.productionBatchId], references: [productionBatch.id] }),
  recipeMaterial: one(productionRecipeMaterial, { fields: [productionBatchMaterialUsage.recipeMaterialId], references: [productionRecipeMaterial.id] }),
  material: one(productionMaterial, { fields: [productionBatchMaterialUsage.materialId], references: [productionMaterial.id] }),
}));

export const stockAdjustmentRelations = relations(stockAdjustment, ({ one }) => ({
  business: one(user, {
    fields: [stockAdjustment.businessId],
    references: [user.id],
    relationName: 'stockAdjustmentBusiness',
  }),
  product: one(product, {
    fields: [stockAdjustment.productId],
    references: [product.id],
  }),
  approvedBy: one(user, {
    fields: [stockAdjustment.approvedById],
    references: [user.id],
    relationName: 'stockAdjustmentApprover',
  }),
}));

export const aiFindingRelations = relations(aiFinding, ({ one }) => ({
  business: one(user, {
    fields: [aiFinding.businessId],
    references: [user.id],
    relationName: 'aiFindingBusiness',
  }),
  product: one(product, {
    fields: [aiFinding.productId],
    references: [product.id],
  }),
  assignedReviewer: one(user, {
    fields: [aiFinding.assignedReviewerId],
    references: [user.id],
    relationName: 'aiFindingReviewer',
  }),
}));

export const riskAssessmentRelations = relations(riskAssessment, ({ one }) => ({
  business: one(user, {
    fields: [riskAssessment.businessId],
    references: [user.id],
  }),
}));

export const aiAuditLogRelations = relations(aiAuditLog, ({ one }) => ({
  requestedBy: one(user, {
    fields: [aiAuditLog.requestedById],
    references: [user.id],
  }),
}));

// ---------------------------------------------------------------------------

