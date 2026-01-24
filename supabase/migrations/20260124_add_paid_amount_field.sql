-- Add paid_amount field to transactions for explicit tracking of cash received at time of sale
-- This helps in accurate Cash in Hand calculations, especially for partial credit sales

-- paid_amount: The cash amount received at the time of sale
-- For full cash sale: paid_amount = total_sale, credit_amount = 0
-- For full credit sale: paid_amount = 0, credit_amount = total_sale
-- For partial credit sale: paid_amount = partial payment, credit_amount = total_sale - partial payment
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2) DEFAULT 0;

-- Create index for cash flow calculations
CREATE INDEX IF NOT EXISTS idx_transactions_paid_amount ON transactions(paid_amount) WHERE paid_amount > 0;

-- Comment for documentation
COMMENT ON COLUMN transactions.paid_amount IS 'Cash amount received at time of sale. For partial credit sales, this is the upfront payment.';

-- Update existing transactions to populate paid_amount based on existing data
-- For post-cutoff (after 2026-01-22): paid_amount = (sell_price * quantity) - credit_amount
-- For pre-cutoff: We cannot reliably determine, so we leave as 0 (will use heuristics in code)
UPDATE transactions 
SET paid_amount = (sell_price * quantity) - COALESCE(credit_amount, 0)
WHERE date >= '2026-01-22' AND paid_amount = 0;
