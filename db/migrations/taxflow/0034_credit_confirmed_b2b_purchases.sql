-- Buyer confirmation immediately credits ordered stock. Transactions with a
-- measured receipt already recorded are excluded to avoid double-crediting.
BEGIN;

LOCK TABLE "transaction", b2b_order_acceptance, b2b_receipt, stock, stock_movement
  IN SHARE ROW EXCLUSIVE MODE;

WITH candidates AS MATERIALIZED (
  SELECT
    acceptance.id AS acceptance_id,
    acceptance.transaction_id,
    txn.buyer_id,
    txn.product_id,
    txn.quantity::real AS quantity,
    acceptance.actor_user_id,
    acceptance.accepted_at
  FROM b2b_order_acceptance AS acceptance
  INNER JOIN "transaction" AS txn ON txn.id = acceptance.transaction_id
  WHERE txn.buyer_id IS NOT NULL
    AND txn.status IN ('confirmed', 'completed')
    AND NOT EXISTS (
      SELECT 1 FROM b2b_receipt AS receipt
      WHERE receipt.transaction_id = txn.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM stock_movement AS movement
      WHERE movement.source_type = 'b2b_order_acceptance'
        AND movement.source_id = acceptance.id
    )
), opening AS MATERIALIZED (
  SELECT
    candidate.*,
    coalesce(current_stock.quantity, 0)::real AS opening_quantity
  FROM candidates AS candidate
  LEFT JOIN stock AS current_stock
    ON current_stock.business_id = candidate.buyer_id
   AND current_stock.product_id = candidate.product_id
), ordered AS (
  SELECT
    opening.*,
    (opening.opening_quantity + coalesce(sum(opening.quantity) OVER (
      PARTITION BY opening.buyer_id, opening.product_id
      ORDER BY opening.accepted_at, opening.transaction_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0))::real AS quantity_before
  FROM opening
), totals AS (
  SELECT buyer_id, product_id, sum(quantity)::real AS quantity
  FROM candidates
  GROUP BY buyer_id, product_id
), updated_stock AS (
  INSERT INTO stock (id, business_id, product_id, quantity)
  SELECT gen_random_uuid()::text, totals.buyer_id, totals.product_id, totals.quantity
  FROM totals
  ON CONFLICT (business_id, product_id)
  DO UPDATE SET
    quantity = stock.quantity + EXCLUDED.quantity,
    updated_at = now()
  RETURNING business_id, product_id
), inserted_movements AS (
  INSERT INTO stock_movement (
    id, business_id, product_id, quantity_delta, quantity_before, quantity_after,
    movement_type, source_type, source_id, actor_user_id, reason
  )
  SELECT
    gen_random_uuid()::text,
    ordered.buyer_id,
    ordered.product_id,
    ordered.quantity,
    ordered.quantity_before,
    ordered.quantity_before + ordered.quantity,
    'b2b_purchase_confirmed',
    'b2b_order_acceptance',
    ordered.acceptance_id,
    ordered.actor_user_id,
    'Backfilled buyer stock from an accepted B2B transaction'
  FROM ordered
  INNER JOIN updated_stock
    ON updated_stock.business_id = ordered.buyer_id
   AND updated_stock.product_id = ordered.product_id
  RETURNING id, actor_user_id, source_id, business_id, product_id,
    quantity_delta, quantity_before, quantity_after
)
INSERT INTO audit_log (
  id, user_id, action, target_type, target_id, before_state, after_state, metadata
)
SELECT
  gen_random_uuid()::text,
  inserted_movements.actor_user_id,
  'B2B_STOCK_CREDITED_ON_CONFIRMATION',
  'stock_movement',
  inserted_movements.id,
  jsonb_build_object('quantity', inserted_movements.quantity_before),
  jsonb_build_object('quantity', inserted_movements.quantity_after),
  jsonb_build_object(
    'acceptanceId', inserted_movements.source_id,
    'businessId', inserted_movements.business_id,
    'productId', inserted_movements.product_id,
    'quantityCredited', inserted_movements.quantity_delta,
    'backfill', true
  )::text
FROM inserted_movements;

COMMIT;
