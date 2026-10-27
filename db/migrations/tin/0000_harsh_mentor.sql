CREATE TABLE "citizen" (
	"id" text PRIMARY KEY NOT NULL,
	"national_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" text,
	"gender" text,
	"province" text,
	"district" text,
	"sector" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "citizen_national_id_unique" UNIQUE("national_id")
);
--> statement-breakpoint
CREATE TABLE "tin_record" (
	"id" text PRIMARY KEY NOT NULL,
	"tin_number" text NOT NULL,
	"national_id" text NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tin_record_tin_number_unique" UNIQUE("tin_number")
);
--> statement-breakpoint
ALTER TABLE "tin_record" ADD CONSTRAINT "tin_record_national_id_citizen_national_id_fk" FOREIGN KEY ("national_id") REFERENCES "public"."citizen"("national_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citizen_national_id_idx" ON "citizen" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "tin_record_tin_number_idx" ON "tin_record" USING btree ("tin_number");--> statement-breakpoint
CREATE INDEX "tin_record_national_id_idx" ON "tin_record" USING btree ("national_id");