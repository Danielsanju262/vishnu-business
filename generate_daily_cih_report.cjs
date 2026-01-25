
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://faupltetudgyzrcfervw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdXBsdGV0dWRneXpyY2ZlcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDM2MTIsImV4cCI6MjA4MzE3OTYxMn0.u5EhHaD_WIHUDXgTVFJe8v4XC7JJEpVEFK9RzHTGrXE';

const supabase = createClient(supabaseUrl, supabaseKey);

// Utility to generate date array
function getDaysArray(start, end) {
    for (var arr = [], dt = new Date(start); dt <= new Date(end); dt.setDate(dt.getDate() + 1)) {
        arr.push(new Date(dt).toISOString().slice(0, 10));
    }
    return arr;
}

async function generateReport() {
    console.log("Generating Verified Daily CIH Report...");

    // 1. Fetch All Data
    const startDate = '2026-01-01';
    const endDate = '2026-01-24';

    // Transactions
    const { data: transactions, error: tError } = await supabase
        .from('transactions')
        .select('*, customers(name), products(name)')
        .is('deleted_at', null)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

    // Collections
    const { data: collections, error: cError } = await supabase
        .from('credit_collections')
        .select('*, customers(name)')
        .gte('collected_at', `${startDate}T00:00:00`)
        .lte('collected_at', `${endDate}T23:59:59`);

    // Payment Reminders (for Heuristic)
    const { data: reminders, error: rError } = await supabase
        .from('payment_reminders')
        .select('customer_id, recorded_at')
        .gte('recorded_at', startDate); // Fetch all from start date onwards

    if (tError || cError || rError) {
        console.error("Error fetching data", { tError, cError, rError });
        return;
    }

    const CUTOFF_DATE = '2026-01-22';
    const allDays = getDaysArray(startDate, endDate);

    let report = `DAILY CASH IN HAND REPORT (${startDate} to ${endDate})\n`;
    report += `Logic: Dashboard V2 (Profit for Cash Sales + Received Payments)\n`;
    report += `Note: Deleted transactions are EXCLUDED.\n`;
    report += '='.repeat(100) + '\n\n';

    let grandTotalCIH = 0;

    allDays.forEach(day => {
        let dayCashProfit = 0;
        let dayCollections = 0;
        let dayNotes = []; // To list credit sales or major events

        // 1. Process Transactions for this Day
        const dayTransactions = transactions.filter(t => t.date === day);

        dayTransactions.forEach(t => {
            const saleTotal = t.quantity * t.sell_price;
            const costTotal = t.quantity * t.buy_price;
            const profit = saleTotal - costTotal;
            const customerName = t.customers?.name || 'Unknown';
            const productName = t.products?.name || 'Unknown';

            let contribution = 0;
            let status = '';

            // LOGIC MATCHING DASHBOARD.TSX
            if (day >= CUTOFF_DATE) {
                // New Logic: Use credit_amount
                const creditAmount = t.credit_amount || 0;
                const paidAmount = saleTotal - creditAmount;

                if (Math.abs(paidAmount - saleTotal) < 0.01) {
                    // Full Cash -> Profit matches CIH
                    contribution = profit;
                    status = 'CASH';
                } else if (paidAmount < 0.01) {
                    // Full Credit -> 0 CIH
                    contribution = 0;
                    status = 'CREDIT';
                    dayNotes.push(`[CREDIT SALE] ${customerName}: ₹${saleTotal} (${productName})`);
                } else {
                    // Partial
                    contribution = paidAmount;
                    status = 'PARTIAL';
                    dayNotes.push(`[PARTIAL] ${customerName}: Paid ₹${paidAmount}/${saleTotal}`);
                }
            } else {
                // Old Logic: Heuristic
                // Check if reminder exists for this customer around this date
                const isCredit = reminders.some(r => {
                    if (r.customer_id !== t.customer_id) return false;
                    const rDateStr = r.recorded_at ? r.recorded_at.split('T')[0] : '';
                    if (!rDateStr) return false;

                    // Exact match
                    if (rDateStr === day) return true;

                    // Or reminder is AFTER sale (within 3 days)
                    // Reminder created to track the debt
                    const dSale = new Date(day);
                    const dRem = new Date(rDateStr);
                    const diffTime = dRem.getTime() - dSale.getTime();
                    const diffDays = diffTime / (1000 * 3600 * 24);

                    return diffDays > 0 && diffDays <= 3;
                });

                if (isCredit) {
                    contribution = 0;
                    status = 'CREDIT (Detected)';
                    dayNotes.push(`[CREDIT DETECTED] ${customerName}: ₹${saleTotal} (${productName})`);
                } else {
                    contribution = profit;
                    status = 'CASH';
                }
            }

            dayCashProfit += contribution;
        });

        // 2. Process Collections for this Day
        const dayColls = collections.filter(c => c.collected_at.startsWith(day));
        dayColls.forEach(c => {
            dayCollections += c.amount;
            const cName = c.customers?.name || 'Unknown';
            dayNotes.push(`[PAYMENT RCVD] ${cName}: ₹${c.amount}`);
        });

        // 3. Totals
        const dayCIH = dayCashProfit + dayCollections;
        grandTotalCIH += dayCIH;

        // 4. Output Line
        report += `DATE: ${day}\n`;
        report += `--------------------------------------------------\n`;
        report += `  + Cash Sales Profit:   ₹${dayCashProfit.toFixed(2)}\n`;
        report += `  + Payments Received:   ₹${dayCollections.toFixed(2)}\n`;
        report += `  = TOTAL CASH IN HAND:  ₹${dayCIH.toFixed(2)}\n`;

        if (dayNotes.length > 0) {
            report += `  Details:\n`;
            dayNotes.forEach(note => report += `    - ${note}\n`);
        }
        report += `\n`;
    });

    report += '='.repeat(100) + '\n';
    report += `GRAND TOTAL CIH (Jan 1 - Jan 24): ₹${grandTotalCIH.toFixed(2)}\n`;

    fs.writeFileSync('daily_cih_report.txt', report, 'utf8');
    console.log("Report generated: daily_cih_report.txt");
}

generateReport();
