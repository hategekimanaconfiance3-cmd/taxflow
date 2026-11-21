-- READ-ONLY historical audit for B2B acceptance credits created before the
-- receipt gate was enforced. This query does not modify any records.
--
-- Results are candidates for officer review, not automatic violation findings.
-- The application FIFO calculator remains authoritative because opening
-- balances, reservations, unsupported movements, and evidence completeness
-- cannot be reconstructed safely by this bounded report alone.

WITH acceptance_credits AS (
  SELECT
    movement.id AS movement_id,
    movement.business_id AS buyer_business_id,
    movement.product_id,
    movement.quantity_delta AS credited_quantity,
    movement.quantity_before AS buyer_stock_before_credit,
    movement.quantity_after AS buyer_stock_after_credit,
    movement.created_at AS credited_at,
    acceptance.id AS acceptance_id,
    acceptance.transaction_id,
    acceptance.accepted_at,
    transaction.seller_id,
    transaction.quantity AS transaction_quantity,
    product.name AS product_name
  FROM public.stock_movement AS movement
  INNER JOIN public.b2b_order_acceptance AS acceptance
    ON acceptance.id = movement.source_id
   AND movement.source_type = 'b2b_order_acceptance'
  INNER JOIN public."transaction" AS transaction
    ON transaction.id = acceptance.transaction_id
  INNER JOIN public.product AS product
    ON product.id = movement.product_id
  WHERE movement.movement_type = 'b2b_purchase_confirmed'
),
receipt_totals AS (
  SELECT
    receipt.transaction_id,
    COALESCE(SUM(receipt.accepted_quantity), 0) AS measured_accepted_quantity,
    COALESCE(SUM(receipt.quantity_received), 0) AS measured_received_quantity
  FROM public.b2b_receipt AS receipt
  GROUP BY receipt.transaction_id
)
SELECT
  credit.movement_id,
  credit.acceptance_id,
  credit.transaction_id,
  credit.buyer_business_id,
  credit.product_id,
  credit.product_name,
  credit.credited_quantity,
  credit.transaction_quantity,
  credit.buyer_stock_before_credit,
  credit.buyer_stock_after_credit,
  credit.accepted_at,
  credit.credited_at,
  COALESCE(receipts.measured_accepted_quantity, 0) AS measured_accepted_quantity,
  COALESCE(receipts.measured_received_quantity, 0) AS measured_received_quantity,
  cycle.baseline_quantity,
  cycle.baseline_status,
  threshold.threshold_percent AS threshold_percent_at_credit,
  prior_request.id AS prior_restock_request_id,
  prior_request.eligibility_status AS prior_request_status,
  prior_request.sell_through_percent AS prior_request_sell_through_percent,
  exception_request.id AS approved_exception_request_id,
  CASE
    WHEN prior_request.eligibility_status = 'eligible' THEN 'PRIOR_ELIGIBLE_REQUEST'
    WHEN exception_request.id IS NOT NULL THEN 'AUTHORIZED_EXCEPTION_REVIEW'
    WHEN cycle.baseline_status = 'needs_review' THEN 'MANUAL_REVIEW_INCOMPLETE_BASELINE'
    ELSE 'POTENTIAL_BYPASS_REQUIRES_FIFO_REVIEW'
  END AS audit_classification
FROM acceptance_credits AS credit
LEFT JOIN receipt_totals AS receipts
  ON receipts.transaction_id = credit.transaction_id
LEFT JOIN public.stock_sell_through_cycle AS cycle
  ON cycle.business_id = credit.buyer_business_id
 AND cycle.product_id = credit.product_id
LEFT JOIN LATERAL (
  SELECT
    policy.threshold_percent
  FROM public.stock_sell_through_threshold AS policy
  WHERE policy.scope_type = 'default'
    AND policy.scope_key = '*'
    AND policy.effective_at <= credit.credited_at
  ORDER BY policy.effective_at DESC, policy.created_at DESC, policy.id DESC
  LIMIT 1
) AS threshold ON TRUE
LEFT JOIN LATERAL (
  SELECT
    request.id,
    request.eligibility_status,
    request.sell_through_percent
  FROM public.stock_restock_request AS request
  WHERE request.business_id = credit.buyer_business_id
    AND request.product_id = credit.product_id
    AND request.created_at <= credit.credited_at
  ORDER BY request.created_at DESC, request.id DESC
  LIMIT 1
) AS prior_request ON TRUE
LEFT JOIN LATERAL (
  SELECT request.id
  FROM public.stock_restock_request AS request
  WHERE request.business_id = credit.buyer_business_id
    AND request.product_id = credit.product_id
    AND request.exception_status IN ('approved', 'consumed')
    AND request.requested_quantity >= credit.credited_quantity
    AND COALESCE(request.reviewed_at, request.created_at) <= credit.credited_at
  ORDER BY COALESCE(request.reviewed_at, request.created_at) DESC, request.id DESC
  LIMIT 1
) AS exception_request ON TRUE
ORDER BY credit.credited_at DESC, credit.movement_id;
