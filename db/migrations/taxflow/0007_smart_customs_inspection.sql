ALTER TABLE "import_declaration"
  ADD COLUMN IF NOT EXISTS "supplier_name" text,
  ADD COLUMN IF NOT EXISTS "expected_return_date" text,
  ADD COLUMN IF NOT EXISTS "estimated_value" integer,
  ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'RWF' NOT NULL,
  ADD COLUMN IF NOT EXISTS "inspected_quantity" real,
  ADD COLUMN IF NOT EXISTS "inspection_note" text,
  ADD COLUMN IF NOT EXISTS "inspected_at" timestamp;
