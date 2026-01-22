-- Add tracking fields to transactions table for proper sale-to-payment linking
-- This allows accurate delete/edit operations that correctly update linked payment reminders and accounts payable

-- credit_amount: The amount that was recorded as credit (outstanding) for this sale
-- This is the (total_sale - paid_amount), NOT the full sale amount
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS credit_amount DECIMAL(10, 2) DEFAULT 0;

-- linked_supplier_id: The supplier ID if a linked supplier payment was created from this sale
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_supplier_id UUID REFERENCES suppliers(id);

-- linked_supplier_amount: The amount that was added to accounts_payable for the supplier
-- This is the payableAmount entered during sale, NOT the buy_price
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_supplier_amount DECIMAL(10, 2) DEFAULT 0;

-- Create index for faster lookups when deleting/editing
CREATE INDEX IF NOT EXISTS idx_transactions_linked_supplier ON transactions(linked_supplier_id) WHERE linked_supplier_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN transactions.credit_amount IS 'Credit amount recorded for this sale (total - paid_amount). Used for accurate delete/edit reversals.';
COMMENT ON COLUMN transactions.linked_supplier_id IS 'Supplier ID if a linked payment was created. Used for accurate delete/edit reversals.';
COMMENT ON COLUMN transactions.linked_supplier_amount IS 'Amount added to supplier accounts_payable. Used for accurate delete/edit reversals.';
