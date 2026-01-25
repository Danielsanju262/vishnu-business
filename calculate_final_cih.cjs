
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://faupltetudgyzrcfervw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdXBsdGV0dWRneXpyY2ZlcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDM2MTIsImV4cCI6MjA4MzE3OTYxMn0.u5EhHaD_WIHUDXgTVFJe8v4XC7JJEpVEFK9RzHTGrXE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to find a subset of sales that sum to target
function findSubsetSum(sales, target, tolerance = 1) {
    // Basic recursion for subset sum
    // sales is array of { id, total, ... }
    // Returns array of sales or null

    // Sort by total descending to try larger items first
    const sorted = [...sales].sort((a, b) => b.total - a.total);

    function recurse(index, currentSum, currentPath) {
        if (Math.abs(currentSum - target) < tolerance) {
            return currentPath;
        }
        if (index >= sorted.length) return null;
        if (currentSum > target + tolerance) return null;

        // Include current
        const withCurrent = recurse(index + 1, currentSum + sorted[index].total, [...currentPath, sorted[index]]);
        if (withCurrent) return withCurrent;

        // Exclude current
        const withoutCurrent = recurse(index + 1, currentSum, currentPath);
        if (withoutCurrent) return withoutCurrent;

        return null;
    }

    return recurse(0, 0, []);
}

async function syncSales() {
    const creditsData = JSON.parse(fs.readFileSync('extracted_credits.json', 'utf8'));

    // 1. Resolve Customer IDs
    console.log("Fetching customer IDs...");
    const customerMap = {};
    for (const item of creditsData) {
        let { data, error } = await supabase.from('customers').select('id, name').ilike('name', item.customer).maybeSingle();
        if (!data) {
            const { data: list } = await supabase.from('customers').select('id, name').ilike('name', `%${item.customer.split(' ')[0]}%`);
            if (list) {
                const best = list.find(c => c.name.replace(/\s+/g, '').toLowerCase().includes(item.customer.replace(/\s+/g, '').toLowerCase()));
                if (best) data = best;
            }
        }
        if (data) {
            customerMap[item.customer] = data.id;
            console.log(`Matched '${item.customer}' -> ${data.name} (${data.id})`);
        } else {
            console.error(`Could not find customer: ${item.customer}`);
        }
    }

    const updates = [];
    const customerIds = Object.values(customerMap);

    // 2. Fetch ALL sales for these customers
    const { data: allSales } = await supabase
        .from('transactions')
        .select('*')
        .in('customer_id', customerIds)
        .gte('date', '2026-01-01')
        .is('deleted_at', null);

    // Group sales by customer
    const salesByCustomer = {};
    allSales.forEach(t => {
        if (!salesByCustomer[t.customer_id]) salesByCustomer[t.customer_id] = [];
        t.total = t.quantity * t.sell_price; // Pre-calc total
        t._matched = false; // Init matched flag
        salesByCustomer[t.customer_id].push(t);
    });

    // 3. Match Expected Credits
    for (const item of creditsData) {
        const custId = customerMap[item.customer];
        if (!custId) continue;

        const customerSales = salesByCustomer[custId] || [];

        for (const entry of item.entries) {
            const targetAmount = entry.amount;
            const targetDate = new Date(entry.date);
            const dateStr = entry.date; // 2026-01-22

            // Filters
            // We want unmatched sales
            // Search Order:
            // 1. Exact Date, Subset Sum
            // 2. +/- 1 Day, Subset Sum
            // 3. +/- 2 Days, Subset Sum

            let matchedSubset = null;
            let matchedReason = "";

            // Try Exact Date
            const exactDateSales = customerSales.filter(s => !s._matched && s.date === dateStr);
            matchedSubset = findSubsetSum(exactDateSales, targetAmount);
            if (matchedSubset) {
                matchedReason = `Exact Date Match (${dateStr}) for ₹${targetAmount}`;
            }

            // Try Nearby Dates (if no exact match)
            if (!matchedSubset) {
                const nearbySales = customerSales.filter(s => {
                    if (s._matched) return false;
                    const d = new Date(s.date);
                    const diffTime = Math.abs(d - targetDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 3; // +/- 3 days
                });
                matchedSubset = findSubsetSum(nearbySales, targetAmount);
                if (matchedSubset) {
                    matchedReason = `Nearby Date Match for ${dateStr} ₹${targetAmount}`;
                }
            }

            if (matchedSubset) {
                // Mark as matched
                matchedSubset.forEach(s => {
                    s._matched = true;
                    // Prepare Update: Credit Sale
                    // Paid = 0, Credit = Total
                    if (s.paid_amount !== 0 || s.credit_amount !== s.total) {
                        updates.push({
                            id: s.id,
                            paid_amount: 0,
                            credit_amount: s.total,
                            reason: `${matchedReason} (Set to Credit)`
                        });
                    }
                });
                console.log(`[MATCH] ${item.customer}: ${dateStr} ₹${targetAmount} -> Matched ${matchedSubset.length} txns ids: ${matchedSubset.map(s => s.id).join(',')}`);
            } else {
                console.log(`[MISSING] ${item.customer}: ${dateStr} ₹${targetAmount} -> No matching transactions found.`);
            }
        }
    }

    // 4. Default Others to Cash
    for (const custId of customerIds) {
        const custSales = salesByCustomer[custId] || [];
        for (const sale of custSales) {
            if (!sale._matched) {
                // Not matched -> Cash Sale
                // Paid = Total, Credit = 0
                if (sale.paid_amount !== sale.total || sale.credit_amount !== 0) {
                    updates.push({
                        id: sale.id,
                        paid_amount: sale.total,
                        credit_amount: 0,
                        reason: "Not in Credit List (Default to Cash)"
                    });
                }
            }
        }
    }

    console.log(`\nProposed Updates: ${updates.length}`);
    fs.writeFileSync('final_cih_updates_v2.json', JSON.stringify(updates, null, 2));

    // Apply
    console.log("Applying updates...");
    for (const u of updates) {
        const { error } = await supabase.from('transactions').update({
            paid_amount: u.paid_amount,
            credit_amount: u.credit_amount
        }).eq('id', u.id);

        if (error) console.error(`Error updating ${u.id}:`, error);
    }
    console.log("Applied all updates.");
}

syncSales();
