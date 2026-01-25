const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://faupltetudgyzrcfervw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdXBsdGV0dWRneXpyY2ZlcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDM2MTIsImV4cCI6MjA4MzE3OTYxMn0.u5EhHaD_WIHUDXgTVFJe8v4XC7JJEpVEFK9RzHTGrXE';
const supabase = createClient(supabaseUrl, supabaseKey);

const CUTOFF_DATE = '2026-01-23';

async function verify() {
    // 1. Fetch Jan Transactions
    const { data: tx } = await supabase
        .from('transactions')
        .select('date, quantity, sell_price, buy_price, credit_amount')
        .gte('date', '2026-01-01')
        .is('deleted_at', null);

    // 2. Fetch Collections
    const { data: col } = await supabase
        .from('credit_collections')
        .select('amount, collected_at')
        .gte('collected_at', '2026-01-01T00:00:00');

    let totalCIH = 0;
    let historicCount = 0;
    let modernCount = 0;

    console.log("--- VERIFICATION REPORT ---");

    // Transactions Logic
    tx.forEach(t => {
        const isHistoric = t.date < CUTOFF_DATE;
        const creditVal = t.credit_amount || 0;
        const profit = (t.quantity * t.sell_price) - (t.quantity * t.buy_price);

        let contribution = 0;

        if (isHistoric) {
            historicCount++;
            // Historic: 0 means Credit (Contribution 0). >0 means Cash (Contribution Profit).
            if (creditVal === 0) {
                contribution = 0;
            } else {
                contribution = profit;
            }
        } else {
            modernCount++;
            // Modern: >0 means Credit (Contribution 0). 0 means Cash (Contribution Profit).
            if (creditVal > 0) {
                contribution = 0;
            } else {
                contribution = profit;
            }
        }
        totalCIH += contribution;
    });

    console.log(`Transactions Processed: ${tx.length}`);
    console.log(`- Historic (< Jan 23): ${historicCount}`);
    console.log(`- Modern (>= Jan 23): ${modernCount}`);

    // Collections
    const totalCollections = col.reduce((sum, c) => sum + (c.amount || 0), 0);
    console.log(`Total Collections (Jan): ₹${totalCollections.toLocaleString()}`);

    const finalTotal = totalCIH + totalCollections;
    console.log(`\nExpected Jan CIH: ₹${finalTotal.toLocaleString()}`);

    // Break it down by day for debugging
    // console.log("\nDaily Breakdown (First 5 days with activity):");
    // const daily = {};
    // tx.forEach(t => { ... });
}

verify();
