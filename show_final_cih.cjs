
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://faupltetudgyzrcfervw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdXBsdGV0dWRneXpyY2ZlcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDM2MTIsImV4cCI6MjA4MzE3OTYxMn0.u5EhHaD_WIHUDXgTVFJe8v4XC7JJEpVEFK9RzHTGrXE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function showCIH() {
    const startDate = '2026-01-01';

    // 1. Fetch Transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', startDate)
        .is('deleted_at', null);

    // 2. Fetch Collections
    const { data: collections } = await supabase
        .from('credit_collections')
        .select('*')
        .gte('collected_at', `${startDate}T00:00:00`);

    // Calculate
    let totalSales = 0;
    let totalCredit = 0;

    // CIH from Sales Logic: Paid Amount
    let cihFromSales = 0;
    let totalProductValue = 0; // buy_price * quantity

    transactions.forEach(t => {
        const saleVal = t.quantity * t.sell_price;
        const buyVal = t.quantity * (t.buy_price || 0); // Cost of matching product
        const credit = t.credit_amount || 0;
        const paid = t.paid_amount;

        totalSales += saleVal;
        totalCredit += credit;
        cihFromSales += paid;

        // We deduct product value for ALL sales, or just cash sales?
        // Usually "Net Cash" implies we replenished the stock using cash.
        // Assuming we want to deduct the cost of goods sold from the cash in hand.
        totalProductValue += buyVal;
    });

    let cihFromCollections = collections.reduce((sum, c) => sum + c.amount, 0);

    // Initial CIH
    const grossCIH = cihFromSales + cihFromCollections;

    // Net CIH
    const netCIH = grossCIH - totalProductValue;

    console.log("\n====== VISHNU BUSINESS FINANCIALS (Jan 1st - Now) ======");
    console.log(`Total Sales Value:       ₹${totalSales.toLocaleString()}`);
    console.log(`Total Credit Given:      ₹${totalCredit.toLocaleString()}`);
    console.log("--------------------------------------------------");
    console.log(`(+) Cash from Sales:     ₹${cihFromSales.toLocaleString()}`);
    console.log(`(+) Cash from Collections: ₹${cihFromCollections.toLocaleString()}`);
    console.log(`(-) Product Buy Value:   ₹${totalProductValue.toLocaleString()}`);
    console.log("--------------------------------------------------");
    console.log(`✅ NET CASH IN HAND:     ₹${netCIH.toLocaleString()}`);
    console.log("==================================================\n");
}

showCIH();
