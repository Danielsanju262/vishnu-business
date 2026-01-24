-- Migration Script: Backfill credit_collections from payment_reminders notes
-- Run this ONCE after creating the credit_collections table
-- This version is more robust and handles various date formats

-- Clear existing migrated data first
TRUNCATE TABLE credit_collections;

DO $$
DECLARE
    reminder RECORD;
    note_line TEXT;
    note_lines TEXT[];
    amount_text TEXT;
    amount_val NUMERIC;
    date_bracket TEXT;
    extracted_date TIMESTAMPTZ;
    success_count INT := 0;
    skip_count INT := 0;
BEGIN
    
    -- Loop through ALL payment reminders with notes (including 'paid' status)
    FOR reminder IN 
        SELECT id, customer_id, note, recorded_at, status
        FROM payment_reminders 
        WHERE note IS NOT NULL 
        AND note != ''
    LOOP
        -- Split note by newlines
        note_lines := string_to_array(reminder.note, E'\n');
        
        FOREACH note_line IN ARRAY note_lines
        LOOP
            -- Check if this line contains "Received" (case insensitive)
            IF note_line ILIKE '%Received:%' AND note_line LIKE '%₹%' THEN
                BEGIN
                    -- Extract the amount after ₹ symbol
                    -- Look for pattern: ₹ followed by digits and commas
                    amount_text := substring(note_line FROM '₹([0-9,]+)');
                    
                    IF amount_text IS NOT NULL THEN
                        -- Remove commas and convert to number
                        amount_val := replace(amount_text, ',', '')::NUMERIC;
                        
                        IF amount_val > 0 THEN
                            -- Try to extract date from brackets [...]
                            date_bracket := substring(note_line FROM '\[([^\]]+)\]');
                            
                            IF date_bracket IS NOT NULL THEN
                                -- Try to parse the date
                                -- Expected formats:
                                -- "22 Jan 2026 14:40" (with year)
                                -- "22 Jan 14:40" (without year)
                                BEGIN
                                    -- First, try parsing with year using to_timestamp
                                    -- Format: DD Mon YYYY HH24:MI
                                    extracted_date := to_timestamp(date_bracket, 'DD Mon YYYY HH24:MI');
                                EXCEPTION WHEN OTHERS THEN
                                    BEGIN
                                        -- Try without time: DD Mon YYYY
                                        extracted_date := to_timestamp(date_bracket, 'DD Mon YYYY');
                                    EXCEPTION WHEN OTHERS THEN
                                        BEGIN
                                            -- Try old format without year: DD Mon HH24:MI
                                            -- Use recorded_at year
                                            extracted_date := to_timestamp(
                                                date_bracket || ' ' || EXTRACT(YEAR FROM reminder.recorded_at)::TEXT,
                                                'DD Mon HH24:MI YYYY'
                                            );
                                        EXCEPTION WHEN OTHERS THEN
                                            -- Fallback: use recorded_at timestamp
                                            extracted_date := reminder.recorded_at;
                                        END;
                                    END;
                                END;
                            ELSE
                                -- No date bracket found, use recorded_at
                                extracted_date := reminder.recorded_at;
                            END IF;
                            
                            -- Insert into credit_collections
                            INSERT INTO credit_collections (
                                customer_id, 
                                payment_reminder_id, 
                                amount, 
                                collected_at,
                                note
                            )
                            VALUES (
                                reminder.customer_id,
                                reminder.id,
                                amount_val,
                                extracted_date,
                                'Migrated from notes'
                            );
                            
                            success_count := success_count + 1;
                            
                        END IF;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    -- Skip this line if any error occurs
                    skip_count := skip_count + 1;
                    RAISE NOTICE 'Skipped line: % (Error: %)', note_line, SQLERRM;
                END;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Migration complete. Inserted: % records. Skipped: % lines.', success_count, skip_count;
END $$;

-- Verify migration results
SELECT 
    'Total collections migrated:' as info, 
    COUNT(*) as count 
FROM credit_collections;

-- Show daily summary
SELECT 
    DATE(collected_at) as collection_date,
    COUNT(*) as num_transactions,
    SUM(amount) as total_amount
FROM credit_collections
GROUP BY DATE(collected_at)
ORDER BY collection_date DESC
LIMIT 30;

-- VERIFICATION: Compare expected vs actual
SELECT 
    'Expected (from notes):' as source,
    COUNT(*) as count
FROM payment_reminders pr,
    LATERAL unnest(string_to_array(pr.note, E'\n')) as line
WHERE line ILIKE '%Received:%'
  AND line LIKE '%₹%'
UNION ALL
SELECT 
    'Actual (migrated):' as source,
    COUNT(*) as count
FROM credit_collections;
