
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://faupltetudgyzrcfervw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdXBsdGV0dWRneXpyY2ZlcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDM2MTIsImV4cCI6MjA4MzE3OTYxMn0.u5EhHaD_WIHUDXgTVFJe8v4XC7JJEpVEFK9RzHTGrXE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchSales() {
    const startDate = '2026-01-01';
    const endDate = '2026-01-24'; // Today based on metadata

    console.log(`Fetching sales from ${startDate} to ${endDate}...`);

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*, customers(name), products(name)')
        .is('deleted_at', null)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching transactions:', error);
        return;
    }

    console.log(`Found ${transactions.length} sales.\n`);
    console.log('ID | Date | Customer | Product | Total | Credit Amount | Is Credit?');
    console.log('-'.repeat(80));

    let totalSales = 0;
    let totalCredit = 0;

    transactions.forEach(t => {
        const total = t.quantity * t.sell_price;
        const credit = t.credit_amount || 0;
        const isCredit = credit > 0;
        const customerName = t.customers?.name || 'Unknown';
        const productName = t.products?.name || 'Unknown';

        totalSales += total;
        if (isCredit) totalCredit += credit;

        console.log(`${t.id.slice(0, 8)} | ${t.date} | ${customerName.padEnd(15)} | ${productName.padEnd(15)} | ${total.toFixed(2).padStart(8)} | ${credit.toFixed(2).padStart(8)} | ${isCredit ? 'YES' : 'NO'}`);
    });

    console.log('-'.repeat(80));
    console.log(`Total Sales Value: ${totalSales.toFixed(2)}`);
    console.log(`Total Credit Value: ${totalCredit.toFixed(2)}`);
}

fetchSales();
