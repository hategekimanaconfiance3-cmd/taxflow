import { relations, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, real, jsonb, index, uniqueIndex, bigint } from 'drizzle-orm/pg-core';

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

export const rraStaffRelations = relations(rraStaff, ({ one }) => ({
  user: one(user, {
    fields: [rraStaff.userId],
    references: [user.id],
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
      .notNull()
      .references(() => user.id),
    category: text('category').notNull().default('general'), // general | tax_query | account_issue | system_bug | other
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

