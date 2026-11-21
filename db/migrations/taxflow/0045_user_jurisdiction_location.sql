-- Add district and province columns to the user table for jurisdiction-based filtering.
-- These columns allow RRA staff with province/district scope to see only manufacturers
-- in their assigned area. NULL means location not yet recorded (treated as national).
BEGIN;

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT;

-- Index for efficient jurisdiction filtering on the manufacturing activity search
CREATE INDEX IF NOT EXISTS user_district_idx ON public."user" (district)
  WHERE district IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_province_idx ON public."user" (province)
  WHERE province IS NOT NULL;

-- Partial index: fast lookup of manufacturers by district (the primary query path)
CREATE INDEX IF NOT EXISTS user_role_district_idx ON public."user" (role, district)
  WHERE role = 'manufacturer' AND district IS NOT NULL;

COMMIT;
