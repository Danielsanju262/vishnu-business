-- Manual Credit Collections Insert
-- Extracted from user screenshots on 24 Jan 2026
-- Run this in Supabase SQL Editor

-- First, clear existing migrations for these customers to avoid duplicates
DELETE FROM credit_collections 
WHERE customer_id IN (
    SELECT id FROM customers 
    WHERE name IN ('TAJ HOTEL SIVAJINAGAR', 'ARMANE BIRIYANI JUNCTION', 'PREM', 'V M BALAJI MILK KOVA DIARY')
);

-- Insert all payment received entries from screenshots

-- TAJ HOTEL SIVAJINAGAR
INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 9570, '2026-01-22 20:10:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'TAJ HOTEL SIVAJINAGAR';

INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 9570, '2026-01-15 16:20:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'TAJ HOTEL SIVAJINAGAR';

INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 10990, '2026-01-08 10:08:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'TAJ HOTEL SIVAJINAGAR';

-- ARMANE BIRIYANI JUNCTION
INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 2000, '2026-01-17 20:49:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'ARMANE BIRIYANI JUNCTION';

INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 2000, '2026-01-15 16:20:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'ARMANE BIRIYANI JUNCTION';

-- PREM
INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 8000, '2026-01-17 20:48:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'PREM';

INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 6000, '2026-01-12 17:18:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'PREM';

INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 6000, '2026-01-08 12:34:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'PREM';

-- V M BALAJI MILK KOVA DIARY
INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 5690, '2026-01-22 20:09:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'V M BALAJI MILK KOVA DIARY';

INSERT INTO credit_collections (customer_id, amount, collected_at, note)
SELECT id, 8000, '2026-01-08 10:12:00+05:30', 'Manual entry from screenshot'
FROM customers WHERE name = 'V M BALAJI MILK KOVA DIARY';

-- Verify the inserts
SELECT 
    c.name as customer_name,
    cc.amount,
    cc.collected_at,
    cc.note
FROM credit_collections cc
JOIN customers c ON c.id = cc.customer_id
WHERE c.name IN ('TAJ HOTEL SIVAJINAGAR', 'ARMANE BIRIYANI JUNCTION', 'PREM', 'V M BALAJI MILK KOVA DIARY')
ORDER BY c.name, cc.collected_at DESC;

-- Show total for This Month (January 2026)
SELECT 
    'Total Earned (Jan 2026):' as info,
    SUM(amount) as total
FROM credit_collections
WHERE collected_at >= '2026-01-01' AND collected_at < '2026-02-01';
