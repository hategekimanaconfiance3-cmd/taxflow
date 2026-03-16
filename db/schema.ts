import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// auth models

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").unique(), // Mapped to TIN for better-auth login
  displayUsername: text("display_username"), // Case-preserving display name (username plugin)
  nationalId: text("national_id").unique(), // 16-digit national ID
  tinNumber: text("tin_number").unique(),
  businessName: text("business_name"), // Auto-fetched from tin_db during signup
  phoneNumber: text("phone_number").unique(), // From phoneNumber plugin
  phoneNumberVerified: boolean("phone_number_verified").default(false),
  role: text("role").notNull().default("retailer"), // manufacturer, wholesaler, retailer, rra_staff
  clearanceStatus: text("clearance_status").default("approved").notNull(),
  // "approved" | "under_review" | "suspended"
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("user_role_idx").on(table.role),
  index("user_clearance_status_idx").on(table.clearanceStatus),
]);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ---------------------------------------------------------------------------
// RRA Staff
// ---------------------------------------------------------------------------

export const rraStaff = pgTable(
  "rra_staff",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    staffId: text("staff_id").notNull().unique(),
    department: text("department"),
    clearanceLevel: text("clearance_level").notNull(),
    assignedBy: text("assigned_by").references(() => user.id),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("rra_staff_userId_idx").on(table.userId),
    index("rra_staff_staffId_idx").on(table.staffId),
  ],
);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    unit: text("unit").notNull(), // "kg", "piece", "liter", etc.
    categoryCode: text("category_code"), // RRA tax classification
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("product_created_by_idx").on(table.createdByUserId),
  ],
);

// ---------------------------------------------------------------------------
// Stock — one row per (business, product) pair
// ---------------------------------------------------------------------------

export const stock = pgTable(
  "stock",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => user.id),
    productId: text("product_id")
      .notNull()
      .references(() => product.id),
    quantity: real("quantity").notNull().default(0),
    price: integer("price"),              // unit price in RWF (nullable for legacy rows)
    source: text("source"),               // e.g. "manufactured", "imported", "purchased"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("stock_business_idx").on(table.businessId),
    uniqueIndex("stock_business_product_uniq").on(
      table.businessId,
      table.productId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const transaction = pgTable(
  "transaction",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sellerId: text("seller_id")
      .notNull()
      .references(() => user.id),
    buyerId: text("buyer_id").references(() => user.id), // null for retail → consumer
    buyerName: text("buyer_name"), // final consumer name (retailer sales only)
    productId: text("product_id")
      .notNull()
      .references(() => product.id),
    quantity: real("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(), // RWF
    totalAmount: integer("total_amount").notNull(), // quantity × unitPrice
    vatAmount: integer("vat_amount").notNull(), // totalAmount × 0.18
    status: text("status").notNull().default("pending"),
    // "pending" | "confirmed" | "rejected" | "completed"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    confirmedAt: timestamp("confirmed_at"),
    rejectedAt: timestamp("rejected_at"),
  },
  (table) => [
    index("txn_seller_idx").on(table.sellerId),
    index("txn_buyer_idx").on(table.buyerId),
    index("txn_status_idx").on(table.status),
    index("txn_product_idx").on(table.productId),
  ],
);

// ---------------------------------------------------------------------------
// VAT Records
// ---------------------------------------------------------------------------

export const vatRecord = pgTable(
  "vat_record",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id),
    businessId: text("business_id")
      .notNull()
      .references(() => user.id),
    vatType: text("vat_type").notNull(), // "input" | "output"
    amount: integer("amount").notNull(), // RWF
    period: text("period"), // e.g. "2026-Q1", "2026-03" for period-based filing
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("vat_business_idx").on(table.businessId),
    index("vat_txn_idx").on(table.transactionId),
    index("vat_business_type_idx").on(table.businessId, table.vatType),
  ],
);

// ---------------------------------------------------------------------------
// Tax Payments — actual payments made to RRA
// ---------------------------------------------------------------------------

export const taxPayment = pgTable(
  "tax_payment",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => user.id),
    amount: integer("amount").notNull(), // RWF
    method: text("method").notNull(), // "mobile_money", "bank_transfer", "cash"
    reference: text("reference").unique(), // payment reference / receipt number
    status: text("status").default("confirmed").notNull(), // "pending", "confirmed", "rejected"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("tax_payment_business_idx").on(table.businessId),
    index("tax_payment_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    // e.g. "TRANSACTION_CREATED", "CLEARANCE_UPDATED"
    targetType: text("target_type"), // "transaction", "user", "product"
    targetId: text("target_id"),
    metadata: text("metadata"), // JSON string for extra context
    ipAddress: text("ip_address"), // source IP for financial audit trail
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_user_idx").on(table.userId),
    index("audit_action_idx").on(table.action),
    index("audit_target_idx").on(table.targetType, table.targetId),
  ],
);

// ---------------------------------------------------------------------------
// System Configuration — admin-editable key-value settings
// ---------------------------------------------------------------------------

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(),
    // "txn_incoming", "txn_confirmed", "txn_rejected", "compliance_alert", "system"
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link"), // optional path to navigate to, e.g. "/dashboard/pending"
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_user_idx").on(table.userId),
    index("notification_read_idx").on(table.userId, table.read),
  ],
);

// ---------------------------------------------------------------------------
// Import Declarations — for imported goods management (§9)
// ---------------------------------------------------------------------------

export const importDeclaration = pgTable(
  "import_declaration",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => user.id),
    productId: text("product_id")
      .notNull()
      .references(() => product.id),
    expectedQuantity: real("expected_quantity").notNull(),
    actualQuantity: real("actual_quantity"), // filled by trader on arrival
    status: text("status").notNull().default("pending"),
    // "pending" → "submitted" → "activated" | "rejected"
    customsRef: text("customs_ref"), // customs reference number
    originCountry: text("origin_country"), // country of origin
    invoiceRef: text("invoice_ref"), // invoice or import document reference
    supportingDoc: text("supporting_doc"), // description of supporting documents
    reviewedById: text("reviewed_by_id").references(() => user.id), // RRA officer who confirmed/rejected
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("import_business_idx").on(table.businessId),
    index("import_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Disputes — for dispute resolution (§13)
// ---------------------------------------------------------------------------

export const dispute = pgTable(
  "dispute",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id),
    filedById: text("filed_by_id")
      .notNull()
      .references(() => user.id),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => user.id),
    referenceNumber: text("reference_number").notNull().unique(),
    reason: text("reason").notNull(),
    evidence: text("evidence"), // file path or text description

    // Status flow: filed → acknowledged/contested → under_review → resolved/dismissed
    status: text("status").notNull().default("filed"),

    // Counterparty response
    counterpartyResponse: text("counterparty_response").notNull().default("pending"),
    // "pending" | "acknowledged" | "contested"
    counterpartyNote: text("counterparty_note"), // counterparty's response note

    // RRA resolution
    rraAction: text("rra_action"),
    // "undo_transaction" | "adjust_amount" | "uphold_dispute" | "dismiss"
    resolution: text("resolution"), // admin resolution notes
    rraOfficialNote: text("rra_official_note"), // official communication sent to both parties
    resolvedById: text("resolved_by_id").references(() => user.id),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("dispute_transaction_idx").on(table.transactionId),
    index("dispute_filed_by_idx").on(table.filedById),
    index("dispute_counterparty_idx").on(table.counterpartyId),
    index("dispute_status_idx").on(table.status),
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
  salesAseller: many(transaction, { relationName: "seller" }),
  purchasesAsBuyer: many(transaction, { relationName: "buyer" }),
  vatRecords: many(vatRecord),
  auditLogs: many(auditLog),
  notifications: many(notification),
  taxPayments: many(taxPayment),
  importDeclarations: many(importDeclaration),
  disputesFiled: many(dispute, { relationName: "filedBy" }),
  disputesCounterparty: many(dispute, { relationName: "counterparty" }),
  disputesResolved: many(dispute, { relationName: "resolvedBy" }),
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

export const transactionRelations = relations(
  transaction,
  ({ one, many }) => ({
    seller: one(user, {
      fields: [transaction.sellerId],
      references: [user.id],
      relationName: "seller",
    }),
    buyer: one(user, {
      fields: [transaction.buyerId],
      references: [user.id],
      relationName: "buyer",
    }),
    product: one(product, {
      fields: [transaction.productId],
      references: [product.id],
    }),
    vatRecords: many(vatRecord),
    disputes: many(dispute),
  }),
);

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
    relationName: "filedBy",
  }),
  counterparty: one(user, {
    fields: [dispute.counterpartyId],
    references: [user.id],
    relationName: "counterparty",
  }),
  resolvedBy: one(user, {
    fields: [dispute.resolvedById],
    references: [user.id],
    relationName: "resolvedBy",
  }),
}));

// ---------------------------------------------------------------------------
// Staff Bulletin Board — internal RRA announcements (Weakness 14)
// ---------------------------------------------------------------------------

export const staffBulletin = pgTable("staff_bulletin", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  authorId: text("author_id").notNull().references(() => user.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  priority: text("priority").notNull().default("info"),  // info | important | urgent
  department: text("department"),  // null = all departments
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("staff_bulletin_author_idx").on(t.authorId),
  index("staff_bulletin_created_idx").on(t.createdAt),
]);

export const staffBulletinRelations = relations(staffBulletin, ({ one }) => ({
  author: one(user, {
    fields: [staffBulletin.authorId],
    references: [user.id],
  }),
}));

// ---------------------------------------------------------------------------
// Support Tickets — taxpayer service requests (Weakness 6)
// ---------------------------------------------------------------------------

export const supportTicket = pgTable("support_ticket", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  traderId: text("trader_id").notNull().references(() => user.id),
  category: text("category").notNull().default("general"), // general | tax_query | account_issue | system_bug | other
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),        // open | in_progress | resolved | closed
  priority: text("priority").notNull().default("medium"),   // low | medium | high
  assignedToId: text("assigned_to_id").references(() => user.id),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("support_ticket_trader_idx").on(t.traderId),
  index("support_ticket_status_idx").on(t.status),
  index("support_ticket_assigned_idx").on(t.assignedToId),
]);

export const supportTicketRelations = relations(supportTicket, ({ one }) => ({
  trader: one(user, {
    fields: [supportTicket.traderId],
    references: [user.id],
    relationName: "ticketTrader",
  }),
  assignedTo: one(user, {
    fields: [supportTicket.assignedToId],
    references: [user.id],
    relationName: "ticketAssignee",
  }),
}));
