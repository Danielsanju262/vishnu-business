-- Credit Collections Table
-- Stores records of payments received against outstanding credit

CREATE TABLE IF NOT EXISTS credit_collections (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    payment_reminder_id uuid REFERENCES payment_reminders(id) ON DELETE SET NULL,
    amount numeric NOT NULL,
    collected_at timestamptz DEFAULT now(),
    note text,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE credit_collections ENABLE ROW LEVEL SECURITY;

-- Policy for full access (adjust as needed for your auth setup)
DROP POLICY IF EXISTS "Enable all operations on credit_collections" ON credit_collections;

CREATE POLICY "Enable all operations on credit_collections"
    ON credit_collections
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for date-based queries (for the date filter)
CREATE INDEX IF NOT EXISTS idx_credit_collections_collected_at 
    ON credit_collections(collected_at);

-- Index for customer lookups
CREATE INDEX IF NOT EXISTS idx_credit_collections_customer_id 
    ON credit_collections(customer_id);
