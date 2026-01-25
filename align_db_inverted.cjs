const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://faupltetudgyzrcfervw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdXBsdGV0dWRneXpyY2ZlcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDM2MTIsImV4cCI6MjA4MzE3OTYxMn0.u5EhHaD_WIHUDXgTVFJe8v4XC7JJEpVEFK9RzHTGrXE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Credit List (Same as before)
const CREDIT_LIST = [
    { name: "V M BALAJI", amount: 2800, date: '2026-01-15' },
    { name: "V M BALAJI", amount: 1900, date: '2026-01-08' },
    { name: "V M BALAJI", amount: 2350, date: '2026-01-08' },
    { name: "PREM", amount: 2700, date: '2026-01-23' },
    { name: "PREM", amount: 4125, date: '2026-01-17' },
    { name: "PREM", amount: 3650, date: '2026-01-15' },
    { name: "PREM", amount: 3650, date: '2026-01-08' },
    { name: "PREM", amount: 5400, date: '2026-01-08' },
    { name: "ARMANE", amount: 660, date: '2026-01-24' },
    { name: "ARMANE", amount: 410, date: '2026-01-22' },
    { name: "ARMANE", amount: 590, date: '2026-01-21' },
    { name: "ARMANE", amount: 590, date: '2026-01-21' }, // Dupe check
    { name: "ARMANE", amount: 590, date: '2026-01-17' },
    { name: "ARMANE", amount: 410, date: '2026-01-13' },
    { name: "ARMANE", amount: 660, date: '2026-01-11' },
    { name: "ARMANE", amount: 250, date: '2026-01-08' },
    { name: "ARMANE", amount: 590, date: '2026-01-08' },
    { name: "ARMANE", amount: 750, date: '2026-01-08' },
    { name: "TAJ HOTEL MM", amount: 850, date: '2026-01-22' }, // Multiple dates
    { name: "TAJ HOTEL MM", amount: 850, date: '2026-01-22' },
    { name: "TAJ HOTEL MM", amount: 850, date: '2026-01-20' },
    { name: "TAJ HOTEL MM", amount: 935, date: '2026-01-16' },
    { name: "TAJ HOTEL MM", amount: 850, date: '2026-01-13' },
    { name: "TAJ HOTEL MM", amount: 850, date: '2026-01-11' },
    { name: "TAJ HOTEL MM", amount: 850, date: '2026-01-08' },
    { name: "PARADISE", amount: 10, date: '2026-01-20' },
    { name: "PARADISE", amount: 510, date: '2026-01-09' },
    { name: "SIVAJINAGAR", amount: 1000, date: '2026-01-09' },
    { name: "SIVAJINAGAR", amount: 1000, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 1000, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 1000, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 1000, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 1715, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 3995, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 2140, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 2140, date: '2026-01-08' },
    { name: "SIVAJINAGAR", amount: 1000, date: '2026-01-08' },
    { name: "KUKKOS", amount: 435, date: '2026-01-22' },
    { name: "KUKKOS", amount: 525, date: '2026-01-12' },
    { name: "KUKKOS", amount: 330, date: '2026-01-08' },
];

async function align() {
    const CUTOFF = '2026-01-23';

    // 1. Fetch Customers
    const { data: customers } = await supabase.from('customers').select('id, name');

    const findId = (partial) => customers.find(c => c.name.toUpperCase().includes(partial))?.id;

    // Map list to IDs
    const listMap = CREDIT_LIST.map(l => ({
        ...l,
        id: findId(l.name.split(' ')[0]) // simple heuristic
    })).filter(l => l.id); // Filter out unmapped

    // 2. Fetch Pre-23 Transactions
    const { data: tx } = await supabase
        .from('transactions')
        .select('*')
        .lt('date', CUTOFF)
        .gte('date', '2026-01-01') // Safety (Jan only)
        .is('deleted_at', null);

    console.log(`Processing ${tx.length} historic transactions...`);

    let setCreditCount = 0;
    let setCashCount = 0;

    for (const t of tx) {
        const total = t.quantity * t.sell_price;
        const buy = t.quantity * t.buy_price;

        // Check if this transaction is in our Credit List
        // Match: Customer ID + Approx Amount + Approx Date
        const matchIndex = listMap.findIndex(l =>
            l.id === t.customer_id &&
            Math.abs(l.amount - total) < 2.0 &&
            t.date.startsWith(l.date)
        );

        if (matchIndex > -1) {
            // Found in Credit List
            // User Logic: "Credit is mentioned as 0"
            // So we set credit_amount = 0
            if (t.credit_amount !== 0) {
                await supabase.from('transactions').update({ credit_amount: 0 }).eq('id', t.id);
                setCreditCount++;
                // console.log(`Marked CREDIT (0): ${t.id} - ${total}`);
            }
            // Remove from list to avoid double match
            listMap.splice(matchIndex, 1);
        } else {
            // NOT in Credit List -> Must be Cash Sale
            // User Logic: "If > 0, then Cash Sale"
            // So we set credit_amount = total (or just > 0)
            // But we already populated some with total...
            // We ensure it is > 0
            if ((t.credit_amount || 0) === 0) {
                await supabase.from('transactions').update({ credit_amount: total }).eq('id', t.id);
                setCashCount++;
                // console.log(`Marked CASH (>0): ${t.id} - ${total}`);
            }
        }
    }

    console.log(`Alignment Complete.`);
    console.log(`- Set as Credit (0): ${setCreditCount}`);
    console.log(`- Set as Cash (>0): ${setCashCount}`);
}

align();
