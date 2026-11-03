CREATE SEQUENCE IF NOT EXISTS public.sales_invoice_number_seq;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.sales_invoice (
  id text PRIMARY KEY,
  invoice_number text NOT NULL UNIQUE,
  transaction_id text NOT NULL UNIQUE REFERENCES public."transaction"(id),
  seller_id text NOT NULL REFERENCES public."user"(id),
  buyer_id text REFERENCES public."user"(id),
  snapshot jsonb NOT NULL,
  issued_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_invoice_seller_issued_idx
  ON public.sales_invoice (seller_id, issued_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_invoice_buyer_issued_idx
  ON public.sales_invoice (buyer_id, issued_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.sales_invoice_email_delivery (
  invoice_id text PRIMARY KEY REFERENCES public.sales_invoice(id),
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp,
  provider_message_id text,
  last_error_code text,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT sales_invoice_email_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'not_available')),
  CONSTRAINT sales_invoice_email_attempt_count_check CHECK (attempt_count >= 0)
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_sales_invoice_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Issued sales invoice snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sales_invoice_immutable ON public.sales_invoice;
--> statement-breakpoint
CREATE TRIGGER sales_invoice_immutable
  BEFORE UPDATE OR DELETE ON public.sales_invoice
  FOR EACH ROW EXECUTE FUNCTION public.reject_sales_invoice_mutation();
