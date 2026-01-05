-- SAFEGUARDS: DATA PROTECTION SYSTEM
-- Additional columns to support "Soft Deletes" so data is never truly lost.

-- 1. Transactions (Sales)
ALTER TABLE transactions
ADD COLUMN deleted_at timestamp with time zone default null;

-- 2. Expenses
ALTER TABLE expenses
ADD COLUMN deleted_at timestamp with time zone default null;

-- 3. Expense Presets (Quick Access Items)
ALTER TABLE expense_presets
ADD COLUMN deleted_at timestamp with time zone default null;

-- NOTE: Customers and Products already have 'is_active' column which we will utilize.
