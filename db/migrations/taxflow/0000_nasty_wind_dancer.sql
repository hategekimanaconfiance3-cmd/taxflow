CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"filed_by_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"reference_number" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" text,
	"status" text DEFAULT 'filed' NOT NULL,
	"counterparty_response" text DEFAULT 'pending' NOT NULL,
	"counterparty_note" text,
	"rra_action" text,
	"resolution" text,
	"rra_official_note" text,
	"resolved_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_reference_number_unique" UNIQUE("reference_number")
);
--> statement-breakpoint
CREATE TABLE "import_declaration" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"expected_quantity" integer NOT NULL,
	"actual_quantity" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"customs_ref" text,
	"origin_country" text,
	"invoice_ref" text,
	"supporting_doc" text,
	"reviewed_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category_code" text,
	"created_by_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rra_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"department" text,
	"clearance_level" text NOT NULL,
	"assigned_by" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rra_staff_staff_id_unique" UNIQUE("staff_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"price" integer,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_payment_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"buyer_id" text,
	"buyer_name" text,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"vat_amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	"rejected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"display_username" text,
	"national_id" text,
	"tin_number" text,
	"business_name" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false,
	"role" text DEFAULT 'retailer' NOT NULL,
	"clearance_status" text DEFAULT 'approved' NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_national_id_unique" UNIQUE("national_id"),
	CONSTRAINT "user_tin_number_unique" UNIQUE("tin_number"),
	CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vat_record" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"business_id" text NOT NULL,
	"vat_type" text NOT NULL,
	"amount" integer NOT NULL,
	"period" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_filed_by_id_user_id_fk" FOREIGN KEY ("filed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_counterparty_id_user_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_declaration" ADD CONSTRAINT "import_declaration_business_id_user_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_declaration" ADD CONSTRAINT "import_declaration_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_declaration" ADD CONSTRAINT "import_declaration_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rra_staff" ADD CONSTRAINT "rra_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rra_staff" ADD CONSTRAINT "rra_staff_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_business_id_user_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_payment" ADD CONSTRAINT "tax_payment_business_id_user_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_record" ADD CONSTRAINT "vat_record_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_record" ADD CONSTRAINT "vat_record_business_id_user_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "dispute_transaction_idx" ON "dispute" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "dispute_filed_by_idx" ON "dispute" USING btree ("filed_by_id");--> statement-breakpoint
CREATE INDEX "dispute_counterparty_idx" ON "dispute" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "dispute_status_idx" ON "dispute" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_business_idx" ON "import_declaration" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "import_status_idx" ON "import_declaration" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_read_idx" ON "notification" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "product_created_by_idx" ON "product" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "rra_staff_userId_idx" ON "rra_staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rra_staff_staffId_idx" ON "rra_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_business_idx" ON "stock" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_business_product_uniq" ON "stock" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "tax_payment_business_idx" ON "tax_payment" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "tax_payment_status_idx" ON "tax_payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "txn_seller_idx" ON "transaction" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "txn_buyer_idx" ON "transaction" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "txn_status_idx" ON "transaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "txn_product_idx" ON "transaction" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_clearance_status_idx" ON "user" USING btree ("clearance_status");--> statement-breakpoint
CREATE INDEX "vat_business_idx" ON "vat_record" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "vat_txn_idx" ON "vat_record" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "vat_business_type_idx" ON "vat_record" USING btree ("business_id","vat_type");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");