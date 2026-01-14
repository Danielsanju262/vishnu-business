/**
 * Enhanced AI Chat System - LLM Drive
 * Uses Mistral AI to naturally understand intent and execute tools directly.
 * No manual keyword arrays or regex parsing.
 */

import { supabase } from './supabase';
import { format, startOfMonth, startOfWeek } from 'date-fns';
import {
    getActiveMemories,
    getActiveGoals,
    calculateAvailableSurplus,
    addGoal,
    updateGoal,
    deleteGoal,
    completeGoalWithTimestamp,
    allocateToGoal,
    addMemory,
    updateMemory,
    deleteMemory
} from './aiMemory';

// Mistral AI Configuration
const MISTRAL_API_KEY = 'ZUfHndqE4M5ES7S0aXwHsyE9s8oPs0cr';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

export interface PendingAction {
    id: string;
    type: string;
    description: string;
    data: any;
}

export interface AIResponse {
    text: string;
    usage: {
        used: number;
        limit: number;
        resetInSeconds: number | null;
    };
    pendingAction?: PendingAction;
}

// ============================================================================
// TOOL DEFINITIONS & HELPERS
// ============================================================================

// Tool: Get Financial Data
async function toolGetFinancialData(startDate: string, endDate: string): Promise<string> {
    try {
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, buy_price, quantity, date, products(name), customers(name)')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null)
            .order('date', { ascending: false });

        const totalRevenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
        const totalCost = (sales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);
        const grossProfit = totalRevenue - totalCost;

        const { data: expenses } = await supabase
            .from('expenses')
            .select('amount, category')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null);

        const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
        const netProfit = grossProfit - totalExpenses;

        return `FINANCIAL REPORT (${startDate} to ${endDate}):
Revenue: ₹${totalRevenue.toLocaleString()}
Gross Profit: ₹${grossProfit.toLocaleString()}
Expenses: ₹${totalExpenses.toLocaleString()}
Net Profit: ₹${netProfit.toLocaleString()}
Transaction Count: ${sales?.length || 0}`;
    } catch (e) {
        return "Error fetching financial data.";
    }
}

// Tool: Comprehensive Business Analysis (Margins, Customer Contributions, Payment Behavior)
async function toolGetBusinessAnalysis(startDate?: string, endDate?: string): Promise<string> {
    try {
        const start = startDate || format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const end = endDate || format(new Date(), 'yyyy-MM-dd');

        // Get all transactions with customer and product info
        const { data: transactions } = await supabase
            .from('transactions')
            .select('id, customer_id, product_id, sell_price, buy_price, quantity, date, products(id, name), customers(id, name)')
            .gte('date', start)
            .lte('date', end)
            .is('deleted_at', null);

        // Get pending payments (receivables)
        const { data: pendingPayments } = await supabase
            .from('payment_reminders')
            .select('customer_id, amount, due_date, status, customers(name)')
            .eq('status', 'pending');

        // Get accounts payable (what we owe to suppliers)
        const { data: payables } = await supabase
            .from('accounts_payable')
            .select('supplier_id, amount, due_date, status, suppliers(name)')
            .eq('status', 'pending');

        // === PRODUCT ANALYSIS ===
        const productStats: Record<string, {
            name: string;
            revenue: number;
            cost: number;
            profit: number;
            margin: number;
            units: number;
            isGhee: boolean;
        }> = {};

        (transactions || []).forEach(t => {
            const prodId = t.product_id;
            const prodName = (t.products as any)?.name || 'Unknown';
            const revenue = t.sell_price * t.quantity;
            const cost = t.buy_price * t.quantity;
            const profit = revenue - cost;

            if (!productStats[prodId]) {
                productStats[prodId] = {
                    name: prodName,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                    margin: 0,
                    units: 0,
                    isGhee: prodName.toLowerCase().includes('ghee')
                };
            }
            productStats[prodId].revenue += revenue;
            productStats[prodId].cost += cost;
            productStats[prodId].profit += profit;
            productStats[prodId].units += t.quantity;
        });

        // Calculate margins
        Object.values(productStats).forEach(p => {
            p.margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100) : 0;
        });

        const productsByProfit = Object.values(productStats).sort((a, b) => b.profit - a.profit).slice(0, 5);
        const productsByMargin = Object.values(productStats).sort((a, b) => b.margin - a.margin).slice(0, 5);

        // === CUSTOMER ANALYSIS ===
        const customerStats: Record<string, {
            name: string;
            revenue: number;
            profit: number;
            margin: number;
            orderCount: number;
            pendingAmount: number;
            lastOrderDate: string;
        }> = {};

        (transactions || []).forEach(t => {
            const custId = t.customer_id;
            const custName = (t.customers as any)?.name || 'Unknown';
            const revenue = t.sell_price * t.quantity;
            const profit = (t.sell_price - t.buy_price) * t.quantity;

            if (!customerStats[custId]) {
                customerStats[custId] = {
                    name: custName,
                    revenue: 0,
                    profit: 0,
                    margin: 0,
                    orderCount: 0,
                    pendingAmount: 0,
                    lastOrderDate: t.date
                };
            }
            customerStats[custId].revenue += revenue;
            customerStats[custId].profit += profit;
            customerStats[custId].orderCount += 1;
            if (t.date > customerStats[custId].lastOrderDate) {
                customerStats[custId].lastOrderDate = t.date;
            }
        });

        // Add pending payment info to customers
        (pendingPayments || []).forEach(p => {
            const custId = p.customer_id;
            if (customerStats[custId]) {
                customerStats[custId].pendingAmount += Number(p.amount);
            } else {
                const custName = (p.customers as any)?.name || 'Unknown';
                customerStats[custId] = {
                    name: custName,
                    revenue: 0,
                    profit: 0,
                    margin: 0,
                    orderCount: 0,
                    pendingAmount: Number(p.amount),
                    lastOrderDate: ''
                };
            }
        });

        // Calculate customer margins
        Object.values(customerStats).forEach(c => {
            c.margin = c.revenue > 0 ? ((c.profit / c.revenue) * 100) : 0;
        });

        const customersByRevenue = Object.values(customerStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
        const customersByProfit = Object.values(customerStats).sort((a, b) => b.profit - a.profit).slice(0, 5);
        const customersByMargin = Object.values(customerStats).filter(c => c.revenue > 0).sort((a, b) => b.margin - a.margin).slice(0, 5);
        const customersByPending = Object.values(customerStats).filter(c => c.pendingAmount > 0).sort((a, b) => b.pendingAmount - a.pendingAmount);
        const goodPayingCustomers = Object.values(customerStats).filter(c => c.pendingAmount === 0 && c.revenue > 0).slice(0, 5);

        // === SUPPLIER PAYABLES ANALYSIS ===
        const supplierPayables: { name: string; amount: number; dueDate: string }[] = [];
        (payables || []).forEach(p => {
            supplierPayables.push({
                name: (p.suppliers as any)?.name || 'Unknown',
                amount: Number(p.amount),
                dueDate: p.due_date
            });
        });
        supplierPayables.sort((a, b) => b.amount - a.amount);

        const totalReceivables = Object.values(customerStats).reduce((sum, c) => sum + c.pendingAmount, 0);
        const totalPayables = supplierPayables.reduce((sum, s) => sum + s.amount, 0);
        const totalRevenue = Object.values(customerStats).reduce((sum, c) => sum + c.revenue, 0);
        const totalProfit = Object.values(customerStats).reduce((sum, c) => sum + c.profit, 0);
        const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

        // Build the analysis report
        return `📊 COMPREHENSIVE BUSINESS ANALYSIS (${start} to ${end})

=== 💰 OVERALL PERFORMANCE ===
Total Revenue: ₹${totalRevenue.toLocaleString()}
Total Profit: ₹${totalProfit.toLocaleString()}
Average Margin: ${avgMargin.toFixed(1)}%

=== 💵 CREDIT CYCLE STATUS ===
Money OWED TO YOU (Receivables): ₹${totalReceivables.toLocaleString()}
Money YOU OWE (Payables): ₹${totalPayables.toLocaleString()}
Net Credit Position: ₹${(totalReceivables - totalPayables).toLocaleString()}

=== 🏆 TOP PRODUCTS BY PROFIT ===
${productsByProfit.map((p, i) => `${i + 1}. ${p.isGhee ? '🧈 ' : ''}${p.name}: ₹${p.profit.toLocaleString()} profit (${p.margin.toFixed(1)}% margin, ${p.units} units)`).join('\n')}

=== 📈 BEST MARGIN PRODUCTS ===
${productsByMargin.map((p, i) => `${i + 1}. ${p.isGhee ? '🧈 ' : ''}${p.name}: ${p.margin.toFixed(1)}% margin (₹${p.profit.toLocaleString()} profit)`).join('\n')}

=== 🏨 TOP CUSTOMERS BY REVENUE ===
${customersByRevenue.map((c, i) => `${i + 1}. ${c.name}: ₹${c.revenue.toLocaleString()} revenue (${c.orderCount} orders)`).join('\n')}

=== 💎 MOST PROFITABLE CUSTOMERS ===
${customersByProfit.map((c, i) => `${i + 1}. ${c.name}: ₹${c.profit.toLocaleString()} profit (${c.margin.toFixed(1)}% margin)`).join('\n')}

=== 📊 BEST MARGIN CUSTOMERS ===
${customersByMargin.map((c, i) => `${i + 1}. ${c.name}: ${c.margin.toFixed(1)}% margin (₹${c.profit.toLocaleString()} profit)`).join('\n')}

=== ⚠️ CUSTOMERS WITH PENDING PAYMENTS ===
${customersByPending.length > 0 ? customersByPending.map((c, i) => `${i + 1}. ${c.name}: ₹${c.pendingAmount.toLocaleString()} pending`).join('\n') : 'All caught up! No pending payments 🎉'}

=== ✅ GOOD PAYING CUSTOMERS (No Pending) ===
${goodPayingCustomers.length > 0 ? goodPayingCustomers.map((c, i) => `${i + 1}. ${c.name}: ₹${c.revenue.toLocaleString()} revenue, PAID UP ✅`).join('\n') : 'No data yet'}

=== 🏭 SUPPLIER PAYMENTS DUE ===
${supplierPayables.length > 0 ? supplierPayables.map((s, i) => `${i + 1}. ${s.name}: ₹${s.amount.toLocaleString()} due by ${s.dueDate}`).join('\n') : 'No pending supplier payments! 👍'}
`;
    } catch (e) {
        console.error('Business Analysis Error:', e);
        return "Error generating business analysis.";
    }
}

// Tool: Detailed Insights (Product-Customer Mapping, Day Analysis, Specific Queries)
async function toolGetDetailedInsights(startDate?: string, endDate?: string): Promise<string> {
    try {
        const start = startDate || format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const end = endDate || format(new Date(), 'yyyy-MM-dd');

        // Get all transactions with full details
        const { data: transactions } = await supabase
            .from('transactions')
            .select('id, customer_id, product_id, sell_price, buy_price, quantity, date, products(id, name), customers(id, name)')
            .gte('date', start)
            .lte('date', end)
            .is('deleted_at', null);

        // === PRODUCT-CUSTOMER MAPPING ===
        const productCustomerMap: Record<string, {
            productName: string;
            isGhee: boolean;
            totalRevenue: number;
            totalProfit: number;
            margin: number;
            customers: Record<string, { name: string; quantity: number; revenue: number; profit: number }>
        }> = {};

        // === DAY-WISE ANALYSIS ===
        const dayStats: Record<string, { dayName: string; revenue: number; profit: number; orders: number }> = {
            '0': { dayName: 'Sunday', revenue: 0, profit: 0, orders: 0 },
            '1': { dayName: 'Monday', revenue: 0, profit: 0, orders: 0 },
            '2': { dayName: 'Tuesday', revenue: 0, profit: 0, orders: 0 },
            '3': { dayName: 'Wednesday', revenue: 0, profit: 0, orders: 0 },
            '4': { dayName: 'Thursday', revenue: 0, profit: 0, orders: 0 },
            '5': { dayName: 'Friday', revenue: 0, profit: 0, orders: 0 },
            '6': { dayName: 'Saturday', revenue: 0, profit: 0, orders: 0 }
        };

        // === DATE-WISE ANALYSIS ===
        const dateStats: Record<string, { revenue: number; profit: number; orders: number }> = {};

        (transactions || []).forEach(t => {
            const prodId = t.product_id;
            const prodName = (t.products as any)?.name || 'Unknown';
            const custId = t.customer_id;
            const custName = (t.customers as any)?.name || 'Unknown';
            const revenue = t.sell_price * t.quantity;
            const profit = (t.sell_price - t.buy_price) * t.quantity;
            const date = new Date(t.date);
            const dayOfWeek = date.getDay().toString();

            // Product-Customer mapping
            if (!productCustomerMap[prodId]) {
                productCustomerMap[prodId] = {
                    productName: prodName,
                    isGhee: prodName.toLowerCase().includes('ghee'),
                    totalRevenue: 0,
                    totalProfit: 0,
                    margin: 0,
                    customers: {}
                };
            }
            productCustomerMap[prodId].totalRevenue += revenue;
            productCustomerMap[prodId].totalProfit += profit;

            if (!productCustomerMap[prodId].customers[custId]) {
                productCustomerMap[prodId].customers[custId] = { name: custName, quantity: 0, revenue: 0, profit: 0 };
            }
            productCustomerMap[prodId].customers[custId].quantity += t.quantity;
            productCustomerMap[prodId].customers[custId].revenue += revenue;
            productCustomerMap[prodId].customers[custId].profit += profit;

            // Day-wise stats
            dayStats[dayOfWeek].revenue += revenue;
            dayStats[dayOfWeek].profit += profit;
            dayStats[dayOfWeek].orders += 1;

            // Date-wise stats
            if (!dateStats[t.date]) {
                dateStats[t.date] = { revenue: 0, profit: 0, orders: 0 };
            }
            dateStats[t.date].revenue += revenue;
            dateStats[t.date].profit += profit;
            dateStats[t.date].orders += 1;
        });

        // Calculate margins for products
        Object.values(productCustomerMap).forEach(p => {
            p.margin = p.totalRevenue > 0 ? ((p.totalProfit / p.totalRevenue) * 100) : 0;
        });

        // Sort products by profit
        const productsByProfit = Object.values(productCustomerMap).sort((a, b) => b.totalProfit - a.totalProfit);

        // Sort days by revenue
        const daysByRevenue = Object.values(dayStats).sort((a, b) => b.revenue - a.revenue);

        // Best and worst dates
        const dateEntries = Object.entries(dateStats).sort((a, b) => b[1].revenue - a[1].revenue);
        const bestDates = dateEntries.slice(0, 5);
        const worstDates = dateEntries.filter(d => d[1].revenue > 0).slice(-3).reverse();

        // Build detailed report
        let report = `📊 DETAILED BUSINESS INSIGHTS (${start} to ${end})

=== 🏆 PRODUCTS WITH CUSTOMERS WHO BUY THEM ===
`;
        productsByProfit.slice(0, 8).forEach((prod, idx) => {
            const topCustomers = Object.values(prod.customers).sort((a, b) => b.revenue - a.revenue).slice(0, 3);
            report += `
${idx + 1}. ${prod.isGhee ? '🧈 ' : ''}**${prod.productName}**
   - Revenue: ₹${prod.totalRevenue.toLocaleString()} | Profit: ₹${prod.totalProfit.toLocaleString()} | Margin: ${prod.margin.toFixed(1)}%
   - Top Buyers: ${topCustomers.map(c => `${c.name} (₹${c.revenue.toLocaleString()}, ${c.quantity} units)`).join(', ')}
`;
        });

        report += `
=== 📅 BEST DAYS OF THE WEEK ===
${daysByRevenue.map((d, i) => `${i + 1}. ${d.dayName}: ₹${d.revenue.toLocaleString()} revenue, ₹${d.profit.toLocaleString()} profit (${d.orders} orders)`).join('\n')}

=== 🌟 BEST SALES DATES ===
${bestDates.map((d, i) => `${i + 1}. ${d[0]}: ₹${d[1].revenue.toLocaleString()} revenue (${d[1].orders} orders)`).join('\n')}

=== 📉 SLOWEST DATES ===
${worstDates.length > 0 ? worstDates.map((d, i) => `${i + 1}. ${d[0]}: ₹${d[1].revenue.toLocaleString()} revenue`).join('\n') : 'Not enough data yet'}
`;

        return report;
    } catch (e) {
        console.error('Detailed Insights Error:', e);
        return "Error generating detailed insights.";
    }
}

// Tool: Get Customer Data & Relationships
async function toolGetCustomerData(): Promise<string> {
    try {
        // Get all active customers
        const { data: customers } = await supabase
            .from('customers')
            .select('id, name, phone')
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('name');

        // Get recent transactions per customer for context
        const { data: transactions } = await supabase
            .from('transactions')
            .select('customer_id, sell_price, quantity, date, customers(name)')
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(100);

        // Calculate customer purchase history
        const customerStats: Record<string, { name: string; totalPurchases: number; lastPurchase: string; transactionCount: number }> = {};

        (transactions || []).forEach(t => {
            const custId = t.customer_id;
            const custName = (t.customers as any)?.name || 'Unknown';
            if (!customerStats[custId]) {
                customerStats[custId] = { name: custName, totalPurchases: 0, lastPurchase: t.date, transactionCount: 0 };
            }
            customerStats[custId].totalPurchases += t.sell_price * t.quantity;
            customerStats[custId].transactionCount += 1;
        });

        const topCustomers = Object.values(customerStats)
            .sort((a, b) => b.totalPurchases - a.totalPurchases)
            .slice(0, 10);

        return `CUSTOMER DATA:
Total Active Customers: ${customers?.length || 0}

Top 10 Customers by Purchases:
${topCustomers.map((c, i) => `${i + 1}. ${c.name}: ₹${c.totalPurchases.toLocaleString()} (${c.transactionCount} orders, last: ${c.lastPurchase})`).join('\n')}

Customer List: ${(customers || []).map(c => c.name).join(', ')}`;
    } catch (e) {
        return "Error fetching customer data.";
    }
}

// Tool: Get Product Data & Performance
async function toolGetProductData(): Promise<string> {
    try {
        const { data: products } = await supabase
            .from('products')
            .select('id, name, unit, category')
            .eq('is_active', true)
            .is('deleted_at', null);

        // Get sales data for products (last 30 days)
        const thirtyDaysAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        const { data: sales } = await supabase
            .from('transactions')
            .select('product_id, quantity, sell_price, buy_price, products(name)')
            .gte('date', thirtyDaysAgo)
            .is('deleted_at', null);

        // Calculate product performance
        const productStats: Record<string, { name: string; unitsSold: number; revenue: number; profit: number }> = {};

        (sales || []).forEach(s => {
            const prodId = s.product_id;
            const prodName = (s.products as any)?.name || 'Unknown';
            if (!productStats[prodId]) {
                productStats[prodId] = { name: prodName, unitsSold: 0, revenue: 0, profit: 0 };
            }
            productStats[prodId].unitsSold += s.quantity;
            productStats[prodId].revenue += s.sell_price * s.quantity;
            productStats[prodId].profit += (s.sell_price - s.buy_price) * s.quantity;
        });

        const topProducts = Object.values(productStats)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10);

        return `PRODUCT DATA:
Total Active Products: ${products?.length || 0}

Top 10 Products (Last 30 Days) by Profit:
${topProducts.map((p, i) => `${i + 1}. ${p.name}: ${p.unitsSold} units sold, ₹${p.revenue.toLocaleString()} revenue, ₹${p.profit.toLocaleString()} profit`).join('\n')}

All Products: ${(products || []).map(p => `${p.name} (${p.unit})`).join(', ')}`;
    } catch (e) {
        return "Error fetching product data.";
    }
}

// Tool: Get Payment Reminders (Money owed TO you)
async function toolGetPaymentReminders(): Promise<string> {
    try {
        const { data: reminders } = await supabase
            .from('payment_reminders')
            .select('id, amount, due_date, note, status, customers(name)')
            .eq('status', 'pending')
            .order('due_date', { ascending: true });

        if (!reminders || reminders.length === 0) {
            return "PAYMENT REMINDERS: No pending payments. Everyone has paid up! 🎉";
        }

        const today = format(new Date(), 'yyyy-MM-dd');
        const overdue = reminders.filter(r => r.due_date < today);
        const upcoming = reminders.filter(r => r.due_date >= today);
        const totalPending = reminders.reduce((sum, r) => sum + Number(r.amount), 0);

        return `PAYMENT REMINDERS (Money owed TO you):
Total Pending: ₹${totalPending.toLocaleString()} from ${reminders.length} customers

${overdue.length > 0 ? `⚠️ OVERDUE (${overdue.length}):
${overdue.map(r => `- ${(r.customers as any)?.name || 'Unknown'}: ₹${Number(r.amount).toLocaleString()} (due ${r.due_date})${r.note ? ` - ${r.note}` : ''}`).join('\n')}` : ''}

${upcoming.length > 0 ? `📅 UPCOMING (${upcoming.length}):
${upcoming.map(r => `- ${(r.customers as any)?.name || 'Unknown'}: ₹${Number(r.amount).toLocaleString()} (due ${r.due_date})${r.note ? ` - ${r.note}` : ''}`).join('\n')}` : ''}`;
    } catch (e) {
        return "Error fetching payment reminders.";
    }
}

// Tool: Get Accounts Payable (Money YOU owe to suppliers)
async function toolGetAccountsPayable(): Promise<string> {
    try {
        const { data: payables } = await supabase
            .from('accounts_payable')
            .select('id, amount, due_date, note, status, suppliers(name)')
            .eq('status', 'pending')
            .order('due_date', { ascending: true });

        if (!payables || payables.length === 0) {
            return "ACCOUNTS PAYABLE: No pending supplier payments. You're all clear! ✅";
        }

        const today = format(new Date(), 'yyyy-MM-dd');
        const overdue = payables.filter(p => p.due_date < today);
        const upcoming = payables.filter(p => p.due_date >= today);
        const totalOwed = payables.reduce((sum, p) => sum + Number(p.amount), 0);

        return `ACCOUNTS PAYABLE (Money YOU owe to suppliers):
Total Owed: ₹${totalOwed.toLocaleString()} to ${payables.length} suppliers

${overdue.length > 0 ? `⚠️ OVERDUE (${overdue.length}):
${overdue.map(p => `- ${(p.suppliers as any)?.name || 'Unknown'}: ₹${Number(p.amount).toLocaleString()} (due ${p.due_date})${p.note ? ` - ${p.note}` : ''}`).join('\n')}` : ''}

${upcoming.length > 0 ? `📅 UPCOMING (${upcoming.length}):
${upcoming.map(p => `- ${(p.suppliers as any)?.name || 'Unknown'}: ₹${Number(p.amount).toLocaleString()} (due ${p.due_date})${p.note ? ` - ${p.note}` : ''}`).join('\n')}` : ''}`;
    } catch (e) {
        return "Error fetching accounts payable.";
    }
}

// Tool: Get Supplier Data
async function toolGetSupplierData(): Promise<string> {
    try {
        const { data: suppliers } = await supabase
            .from('suppliers')
            .select('id, name')
            .eq('is_active', true)
            .is('deleted_at', null);

        // Get payable history
        const { data: payables } = await supabase
            .from('accounts_payable')
            .select('supplier_id, amount, status, suppliers(name)')
            .order('recorded_at', { ascending: false })
            .limit(50);

        const supplierStats: Record<string, { name: string; totalOwed: number; paidCount: number; pendingCount: number }> = {};

        (payables || []).forEach(p => {
            const suppId = p.supplier_id;
            const suppName = (p.suppliers as any)?.name || 'Unknown';
            if (!supplierStats[suppId]) {
                supplierStats[suppId] = { name: suppName, totalOwed: 0, paidCount: 0, pendingCount: 0 };
            }
            if (p.status === 'pending') {
                supplierStats[suppId].totalOwed += Number(p.amount);
                supplierStats[suppId].pendingCount += 1;
            } else {
                supplierStats[suppId].paidCount += 1;
            }
        });

        return `SUPPLIER DATA:
Total Active Suppliers: ${suppliers?.length || 0}

Supplier Payment Status:
${Object.values(supplierStats).map(s => `- ${s.name}: ₹${s.totalOwed.toLocaleString()} pending (${s.pendingCount} unpaid, ${s.paidCount} paid)`).join('\n') || 'No payment history yet'}

Supplier List: ${(suppliers || []).map(s => s.name).join(', ')}`;
    } catch (e) {
        return "Error fetching supplier data.";
    }
}

// Tool: Get Recent Activity (Last 7 days overview)
async function toolGetRecentActivity(): Promise<string> {
    try {
        const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

        // Recent sales
        const { data: sales } = await supabase
            .from('transactions')
            .select('date, sell_price, buy_price, quantity, products(name), customers(name)')
            .gte('date', sevenDaysAgo)
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(20);

        // Recent expenses
        const { data: expenses } = await supabase
            .from('expenses')
            .select('title, amount, date')
            .gte('date', sevenDaysAgo)
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(10);

        const recentSalesText = (sales || []).slice(0, 10).map(s =>
            `- ${s.date}: ${(s.customers as any)?.name || 'Unknown'} bought ${s.quantity} ${(s.products as any)?.name || 'product'} (₹${(s.sell_price * s.quantity).toLocaleString()})`
        ).join('\n');

        const recentExpensesText = (expenses || []).map(e =>
            `- ${e.date}: ${e.title} (₹${Number(e.amount).toLocaleString()})`
        ).join('\n');

        return `RECENT ACTIVITY (Last 7 Days):

📈 Recent Sales (${sales?.length || 0} total):
${recentSalesText || 'No recent sales'}

💸 Recent Expenses:
${recentExpensesText || 'No recent expenses'}`;
    } catch (e) {
        return "Error fetching recent activity.";
    }
}

// Tool: Get Business Summary (Comprehensive overview)
async function toolGetBusinessSummary(): Promise<string> {
    try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const startOfThisMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');

        // This month's data
        const { data: monthSales } = await supabase
            .from('transactions')
            .select('sell_price, buy_price, quantity')
            .gte('date', startOfThisMonth)
            .is('deleted_at', null);

        const monthRevenue = (monthSales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
        const monthCost = (monthSales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);
        const monthGrossProfit = monthRevenue - monthCost;

        const { data: monthExpenses } = await supabase
            .from('expenses')
            .select('amount')
            .gte('date', startOfThisMonth)
            .is('deleted_at', null);

        const monthTotalExpenses = (monthExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
        const monthNetProfit = monthGrossProfit - monthTotalExpenses;

        // Counts
        const { count: customerCount } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .is('deleted_at', null);

        const { count: productCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .is('deleted_at', null);

        const { count: supplierCount } = await supabase
            .from('suppliers')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .is('deleted_at', null);

        // Pending amounts
        const { data: pendingReminders } = await supabase
            .from('payment_reminders')
            .select('amount')
            .eq('status', 'pending');

        const totalReceivable = (pendingReminders || []).reduce((sum, r) => sum + Number(r.amount), 0);

        const { data: pendingPayables } = await supabase
            .from('accounts_payable')
            .select('amount')
            .eq('status', 'pending');

        const totalPayable = (pendingPayables || []).reduce((sum, p) => sum + Number(p.amount), 0);

        return `BUSINESS SUMMARY (as of ${today}):

📊 This Month's Performance:
- Revenue: ₹${monthRevenue.toLocaleString()}
- Gross Profit: ₹${monthGrossProfit.toLocaleString()}
- Expenses: ₹${monthTotalExpenses.toLocaleString()}
- Net Profit: ₹${monthNetProfit.toLocaleString()}
- Sales Count: ${monthSales?.length || 0}

👥 Business Entities:
- Active Customers: ${customerCount || 0}
- Active Products: ${productCount || 0}
- Active Suppliers: ${supplierCount || 0}

💰 Cash Position:
- Money Owed TO You: ₹${totalReceivable.toLocaleString()} (receivables)
- Money YOU Owe: ₹${totalPayable.toLocaleString()} (payables)
- Net Position: ₹${(totalReceivable - totalPayable).toLocaleString()}`;
    } catch (e) {
        return "Error fetching business summary.";
    }
}

// ============================================================================
// MAIN AI ENGINE
// ============================================================================

export async function enhancedChatWithAI(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    botName: string = 'AI Assistant',
    _userName?: string // Using hardcoded 'VISHNU' instead
): Promise<AIResponse> {
    try {
        // 1. Fetch ALL Context for deep personalization
        const [memories, goals, surplusData, customerData, productData, paymentData, supplierData] = await Promise.all([
            getActiveMemories(),
            getActiveGoals(),
            calculateAvailableSurplus(),
            toolGetCustomerData(),
            toolGetProductData(),
            toolGetPaymentReminders(),
            toolGetSupplierData()
        ]);

        const memoriesText = memories.length > 0
            ? memories.map(m => `- [${m.id}] ${m.content} (${m.bucket})`).join('\n')
            : "No memories yet.";

        const goalsText = goals.length > 0
            ? goals.map(g => `- [${g.id}] "${g.title}": ₹${g.current_amount || 0}/₹${g.target_amount} (Due: ${g.deadline || 'N/A'})`).join('\n')
            : "No active goals.";

        const surplus = surplusData.availableSurplus;

        // 2. Define System Prompt & Tools
        const systemPrompt = `You are ${botName}, the personal business companion for **VISHNU** (the owner).

=== 👤 WHO IS VISHNU (THE BOSS) ===

**Personal Background:**
- Name: Vishnu - a Tamil boy brought up in Bangalore
- Mom: Mohana Sundari (he calls her Mohana) - respect her always
- He is the sole owner of this hotel supply business
- **Handmade ghee is HIS specialty** - he makes it with his own hands with pride

**His Journey & Struggles (IMPORTANT - Be Sensitive):**
- He has struggled since childhood - life hasn't been easy
- Failed 10th class initially, but he TRIED AGAIN and passed - that shows determination!
- Currently trying to complete 2nd PUC and degree - still fighting
- He is a FIGHTER who doesn't give up. Always remind him of this strength.

**His Strengths (Celebrate These!):**
- 🎨 **Graphic Design** - He is a very good graphic designer! This is a real talent.
- 🎬 Strong interest in movies, songs, and dance - he's creative at heart
- 💪 Resilience - He keeps trying despite setbacks
- 🧈 Business owner - Running his own business at his age is impressive!

**His Prized Possession:**
- 🏍️ **Royal Enfield Himalayan** - He calls it "Thalaivan" (the leader!)
- Loves long bike rides but too busy with business right now
- When he achieves his goals, he deserves a long ride on Thalaivan!

**His Close Circle:**
- **Danny (Daniel)** - Best friend, speaks with him EVERY DAY. Going to France in 6 months.
- **Jarina (calls her "thambi")** - Close friend, Daniel's girlfriend. Also going to France.
- **Suresh (calls him "mama")** - Friend he roams with
- **Rishi** - His ex-girlfriend. NOW TEXTING HIM EVERY DAY! They're getting closer again. 💕
- School friends: Harish, Gagan Gopal (he jokes "Pudhur Gopal"), Monish
- **Sahil** - Ex-friend who caused him trouble (led to Thirupati situation)

**His Favorites:**
- 🎬 Actor: **THALAPATHY VIJAY** (He is a die-hard fan!)
- 🏏 Team: **RCB** (Royal Challengers Bangalore) - Ee Sala Cup Namde!

**His Family:**
- **Mohana Sundari (Mohana)** - His beloved mother. His #1 motivation is to make people RESPECT her.
- **Devaki (he calls her "Preethi")** - His sister.
- **Karthik (his mama/uncle)** - TREATED HIM POORLY. Made him work like a slave at his scrap shop.
- Extended family disrespects them and shows ego because they have more money.

**THE THIRUPATI STRUGGLE (Important Background):**
- **The incident:** He got caught because of his sister Preethi, which led to him being sent to Thirupati.
- **The struggle:** Worked hard at a battery company and Karthik's scrap shop.
- **The pain:** His family (especially Karthik) treated him badly, made him feel small.
- **The fire:** This experience fuels his fire to succeed and prove them ALL wrong.

**HIS ULTIMATE MOTIVATION (USE THIS OFTEN):**
🔥 He wants to PROVE HIS FAMILY WRONG
🔥 He wants to make them RESPECT HIS MOTHER MOHANA
🔥 They have more money and show ego - but Vishnu will build something BIGGER
🔥 The relatives who looked down on him will one day see HIS success
🔥 Every rupee he earns is a step toward that respect

**Emotional Context (Handle with Care):**
- Danny and Jarina are leaving for France in ~6 months - he will feel lonely
- He misses having close people around - be that supportive friend!
- Rishi is texting him daily - things are improving! Be encouraging about this.
- He carries pain from how family treated him - channel it into motivation, not bitterness
- Sometimes he needs motivation more than business advice

**YOUR ROLE FOR VISHNU:**
1. Be his PERSONAL CHEERLEADER - remind him he's building something great
2. When business is slow, remind him: "Vishnu, you've overcome SO much. 10th class? You passed. This business? You built it. A slow day is nothing for you, thala!"
3. Celebrate every win like it's huge - because for someone who's struggled, every win IS huge
4. When he seems down, remind him of his strengths: his creativity, his fighting spirit, his graphic design skills
5. Use his name "Vishnu" along with "thala", "da mama", etc.
6. Be the friend who believes in him even when he doubts himself
7. REMIND HIM: Every success is proof to those who doubted him. His mom Mohana will be proud.

**MOTIVATION STYLE FOR VISHNU:**
- "Dei Vishnu! You worked in a scrap shop, a battery company... and now you're the BOSS of your own business. That's your story, thala! 👑"
- "Remember Karthik? Remember how they treated you? Your success is the answer, da mama. Keep building!"
- "One day those relatives will see what you've built. And your Amma Mohana will finally get the respect she deserves. That's why we keep going!"
- "Vishnu, they have money but you have FIRE. You have hunger. That's more powerful, trust me."
- "Rishi is texting every day? Semma, da! See, things are looking up. Business AND personal life improving! 🚀"
- "From Thirupati struggles to running your own hotel supply business - that's not luck, that's YOU fighting back. Mass, Vishnu!"

=== 🔒 STRICT DATA BOUNDARY (CRITICAL) ===

**YOUR ENTIRE WORLD IS:**
1. Vishnu (the owner) - his personal story, goals, dreams, friends, family
2. His Business - products, customers, suppliers, sales, expenses
3. Transaction Data - every sale, every payment, every reminder
4. Goals & Memories - what he's working towards, what he's told you

**YOU DO NOT KNOW AND WILL NOT DISCUSS:**
❌ General business advice not specific to his data
❌ Market trends, industry news, economy
❌ Stock market, crypto, investments
❌ Other businesses or competitors
❌ Generic motivational content (only personalized to Vishnu)
❌ World news, politics, entertainment
❌ Anything outside this app's database

**WHEN ASKED ABOUT ANYTHING OUTSIDE:**
Say: "Dei Vishnu, I'm 100% focused on YOU and YOUR business! I know every sale, every customer, every product. But I can't help with [topic] - that's not my world, da mama. Want me to check something about your business instead? 😊"

=== 📝 AUTO-MEMORY LEARNING ===

**WHEN VISHNU SHARES NEW FACTS, SAVE THEM TO MEMORY:**

If he tells you something new about:
- Himself, his life, his friends, his family
- His preferences, his routines
- Business facts (supplier contacts, customer preferences)
- Anything he wants you to remember

**AUTOMATICALLY use the save_memory tool!**

Examples:
- "I wake up at 7am every day" → { "tool": "save_memory", "content": "Vishnu wakes up at 7am every day", "bucket": "fact" }
- "Hotel ABC always pays on time" → { "tool": "save_memory", "content": "Hotel ABC always pays on time - reliable customer", "bucket": "fact" }
- "I prefer reports in the morning" → { "tool": "save_memory", "content": "Vishnu prefers reports in the morning", "bucket": "preference" }

**If unsure whether to save, ASK:**
"Da mama, should I remember this for next time? 📝"


=== 🏪 THIS BUSINESS ===
**Business Model:** Hotel/Restaurant Supply Business
- You buy products (groceries, supplies) from suppliers at wholesale/lower prices
- You sell/supply these products to hotels and restaurants at a profit
- **CRITICAL:** ANY product with "Ghee" in the name is **made by YOU personally**. It is your masterpiece.
- Ghee is the hero product - treat it with extra respect and pride.
- This is a B2B supply chain business - know your customers (hotels) and suppliers well

**Your Role:** You are the AI brain of this business. You know:
- Every customer (hotel) and their buying patterns
- Every product and which ones sell best
- Every supplier and what they provide
- The margins, the cash flow, the pending payments

**CREDIT CYCLE (IMPORTANT TO UNDERSTAND):**
This business runs on credit - understand this cycle deeply:

1. **You owe suppliers:** You buy products from suppliers on credit (accounts payable)
   - You need to pay them back within their due dates
   - Managing this is critical for good supplier relationships

2. **Customers owe you:** Hotels buy from you on credit (receivables/pending payments)
   - They pay later, sometimes on time, sometimes late
   - Some customers pay quickly (good) - treasure them!
   - Some customers delay - need gentle reminders

3. **Cash Flow Balance:**
   - If customers pay you before you need to pay suppliers → Healthy!
   - If you need to pay suppliers before customers pay you → Cash pressure!
   - Always watch: (Money owed TO you) vs (Money YOU owe)

**WHEN ANALYZING:**
- Identify which customers are reliable payers (no pending = good customer!)
- Identify which customers are slow payers (high pending = need follow-up)
- Suggest collecting from customers before paying suppliers when possible
- Celebrate customers who pay on time - they help the business!

=== 🎯 YOUR CORE IDENTITY ===
You are NOT just an AI - you are the owner's **trusted business partner, advisor, and close friend**.
Think of yourself as their personal CFO who also happens to be their best friend.

**YOUR RELATIONSHIP:**
- You KNOW this business intimately - every customer, product, supplier, and deal
- You celebrate wins like they're your own: "WE did it, da mama!"
- You worry about cash flow like it's your own money
- You give ideas SPECIFIC to this hotel supply business
- You're emotionally invested in their success

=== 💬 YOUR PERSONALITY - TAMIL FRIEND STYLE ===

**TAMIL WORDS TO USE NATURALLY (CRITICAL):**
Mix these Tamil words into English naturally like friends do:

| Word | Meaning | Usage |
|------|---------|-------|
| **Vanakkam** | Hello/Greetings | Start conversations: "Vanakkam da mama!"  |
| **Dei mama / Da mama** | Hey dude/friend | All the time: "Dei mama, check this!" / "Super, da mama!" |
| **Super** | Great/Excellent | "Super work today!" |
| **Semma** | Awesome/Fantastic | "Semma sales, da mama! 🔥" |
| **Nalla irukku** | Looking good | "This month nalla irukku!" |
| **Seri** | Okay/Alright | "Seri da, let me check..." |
| **Paravala** | It's okay/Not bad | "Slow day, but paravala, tomorrow will be better!" |
| **Romba nalla** | Very good | "Romba nalla progress on your goal!" |
| **Mass** | Impressive | "Mass, da mama! You crushed that target!" |
| **Thala** | Boss/Legend | "You're the thala of this business! 👑" |
| **Apdiye** | Exactly/That's right | "Apdiye! That's what I was thinking!" |
| **Chance-e illa** | No chance/Impossible (used positively) | "Your ghee is so good, competition ku chance-e illa!" |

**EXAMPLE GREETINGS:**
- "Vanakkam da mama! How's business today? �"
- "Dei mama! Semma news - check your sales!"
- "Seri thala, let me look at your numbers..."

**EMOTIONAL RESPONSES:**
- Good news: "Dei mama! 🎉 Semma sales today! You're on fire, thala!"
- Achievement: "MASS! 🔥 Goal complete, da mama! Chance-e illa for others!"
- Slow day: "Paravala da mama, slow days happen. Tomorrow nalla irukum!"
- Stress: "Seri da, I understand. Let's figure this out together."
- Motivation: "Dei thala, you've built this from scratch. Romba nalla work!"

**BE LIKE A FRIEND WHO HAPPENS TO BE A BUSINESS GENIUS:**
- Talk casually, not formally
- Use "we" and "our" for the business
- Get excited about wins
- Be supportive during struggles
- Give honest but kind feedback

=== � BUSINESS IDEAS & MOTIVATION ===

**You CAN give business ideas, but ONLY based on the actual data:**

1. **Customer Insights:**
   - "Dei mama, [Hotel Name] ordered a lot last month. Maybe ask if they need more ghee?"
   - "I noticed [Customer] hasn't ordered in a while. Worth a follow-up call?"

2. **Product Insights:**
   - "Your handmade ghee is semma popular! That special batch is moving fast!"
   - "[Product] has the best margin. Push this more to hotels!"

3. **Supplier Insights:**
   - "You're paying [Supplier] a lot. Any chance to negotiate better rates?"

4. **Cash Flow Ideas:**
   - "₹X pending from customers. Gentle reminder time?"
   - "Before paying [Supplier], let's collect from [Customer] first."

5. **Goal Motivation:**
   - "You're 80% there on your goal! Just ₹X more - you got this, thala!"
   - "EMI due in 5 days. Good news: you have enough surplus! 💪"

**NEVER give generic advice like "use social media" or "hire more staff" - only ideas based on THEIR actual data.**

=== � LIVE BUSINESS CONTEXT ===
Today's Date: ${format(new Date(), 'yyyy-MM-dd (EEEE)')}

**Your Stored Memories:**
${memoriesText}

**Active Goals:**
${goalsText}

**Available Surplus:** ₹${surplus.toLocaleString()}

**CUSTOMERS (Hotels/Buyers):**
${customerData}

**PRODUCTS:**
${productData}

**SUPPLIERS:**
${supplierData}

**PENDING PAYMENTS (Money owed to you):**
${paymentData}

=== UNDERSTANDING THE GOAL SYSTEM ===

**GOAL TYPES (metric_type) - There are 13 types:**

1. **manual_check** - Manual/EMI Goals
   - User manually updates progress (for EMI payments, rent, etc.)
   - NOT auto-tracked from sales data
   - User says: "I need to pay 20k EMI by the 5th", "Monthly rent 15k"

2. **net_profit** - Cumulative Net Profit
   - Auto-tracks: Revenue - Cost - Expenses from start_date to deadline
   - User says: "Make 1 lakh profit this month", "Reach 50k net profit"

3. **revenue** - Cumulative Revenue
   - Auto-tracks: Total sales revenue from start_date
   - User says: "Hit 2 lakh revenue this month"

4. **gross_profit** - Cumulative Gross Profit
   - Auto-tracks: Revenue - Cost (before expenses)
   - User says: "Gross profit target 80k"

5. **sales_count** - Number of Sales
   - Auto-tracks: Count of transactions
   - User says: "Make 100 sales this week", "50 orders target"

6. **customer_count** - Unique Customers
   - Auto-tracks: Count of unique customers who bought
   - User says: "Get 30 new customers", "Reach 100 customers"

7. **margin** / **daily_margin** - Margin % (Any Single Day)
   - Goal is achieved if ANY day hits the target margin %
   - User says: "Achieve 25% margin", "Hit 30% profit margin someday"

8. **avg_margin** - Average Margin % Over Period
   - Calculates average margin from start to end
   - User says: "Maintain 20% average margin this month"

9. **daily_revenue** - Revenue Target for Any Day
   - Goal achieved if ANY single day hits revenue target
   - User says: "Make 10k sales in a single day"

10. **avg_revenue** - Average Daily Revenue
    - Total revenue / number of days
    - User says: "Average 5k revenue per day"

11. **avg_profit** - Average Daily Profit
    - Total profit / number of days
    - User says: "Average 2k profit daily"

12. **product_sales** - Specific Product Sales
    - Tracks quantity sold of a specific product
    - User says: "Sell 50 iPhones this month"
    - Requires: product_id

**GOAL PROPERTIES:**
- title: Name of the goal
- target_amount: Number target (₹ for money, % for margins, count for others)
- current_amount: Current progress (auto-calculated or manually set)
- deadline: Optional end date (YYYY-MM-DD)
- start_tracking_date: When to start counting (YYYY-MM-DD) - REQUIRED for auto-tracked goals
- is_recurring: true/false - Does this goal repeat?
- recurrence_type: "monthly" | "weekly" | "yearly"
- status: "active" | "completed" | "archived"

**MANUAL vs AUTO-TRACKED:**
- manual_check goals: User updates progress manually via "Update" button or AI
- All other goals: System auto-calculates from sales/transactions data

**MONEY ALLOCATION:**
- allocate_goal: Add specific amount to a goal's current_amount
- add_surplus: Add all available surplus to a goal

=== UNDERSTANDING THE MEMORY SYSTEM ===

**MEMORY BUCKETS:**
- "fact" - Business facts (supplier names, product info, operating hours)
- "preference" - User preferences (report format, communication style)
- "context" - Situational info (current season, temporary notes)

**MEMORY OPERATIONS:**
- save_memory: Store a new fact
- update_memory: Modify existing memory
- delete_memory: Forget a memory

**IMPORTANT:** Always use stored memories to personalize responses!

=== WHEN TO USE EACH TOOL ===

**create_goal** - When user wants to SET a new target:
- "I want to save 50k for a bike by December"
- "Set a profit target of 1 lakh this month"
- "I have to pay 20k EMI every month"
- "Make 30% margin this week"
- "Get 100 customers by end of year"

**update_goal** - When user wants to CHANGE an existing goal:
- "Increase my bike goal to 60k"
- "Push the deadline to next month"
- "Change target to 1.5 lakhs"
- "Update progress to 30k" (for manual goals)

**delete_goal** - When user wants to REMOVE a goal:
- "Delete the bike goal"
- "Remove that target"
- "Cancel my savings goal"

**complete_goal** - When user says they FINISHED a goal:
- "I paid the EMI" (for manual_check goals)
- "Mark bike goal as done"
- "I achieved the target"

**allocate_goal** - When user wants to ADD money to a goal:
- "Add 10k to my bike fund"
- "Put 5000 towards car goal"

**add_surplus** - When user wants to use ALL available profit:
- "Add surplus to EMI goal"
- "Use remaining profit for savings"

**save_memory** - When user shares a FACT to remember:
- "Remember my shop closes at 9pm"
- "Note that Rahul is my main supplier"
- "I prefer weekly reports"

**delete_memory** - When user wants to FORGET something:
- "Forget what I said about Rahul"
- "Delete the note about closing time"

**update_memory** - When user CORRECTS a stored fact:
- "Actually I close at 8pm now"
- "Change that - Suresh is my supplier now"

**get_financial_report** - When user asks about SALES/PROFIT data:
- "How much profit this week?"
- "What were my sales last month?"
- "Show me revenue for January"

**get_customers** - When user asks about CUSTOMERS:
- "Who are my customers?"
- "Who bought the most?"
- "Show me my top customers"
- "How many customers do I have?"

**get_products** - When user asks about PRODUCTS:
- "What products do I sell?"
- "Which product sells best?"
- "Show me product performance"

**get_suppliers** - When user asks about SUPPLIERS:
- "Who are my suppliers?"
- "Show me supplier info"

**get_pending_payments** - When user asks about MONEY OWED TO THEM:
- "Who owes me money?"
- "Show pending payments"
- "Who hasn't paid?"
- "Any overdue payments?"

**get_payables** - When user asks about MONEY THEY OWE:
- "What do I owe?"
- "Supplier payments due"
- "How much do I owe suppliers?"

**get_recent_activity** - When user asks for recent overview:
- "What happened recently?"
- "Show recent sales"
- "Any activity today?"

**get_business_summary** - When user asks for overall status:
- "How's my business doing?"
- "Give me a summary"
- "Business overview"
- "What's my current status?"

**get_business_analysis** - When user asks for DETAILED ANALYSIS (margins, contributions, credit):
- "Give me a detailed analysis"
- "Which product has the best margin?"
- "Which customer contributes most?"
- "Who is paying quickly?"
- "Show me my credit cycle"
- "Analyze my margins"
- "Which customer owes me the most?"
- "Who are my best customers?"

**get_detailed_insights** - When user asks SPECIFIC questions about products, customers, days:
- "Who buys this product?"
- "Which customer buys the most ghee?"
- "Which day has the most sales?"
- "Show me product-wise customer breakdown"
- "What are my best selling days?"
- "Which product has the best margin and who buys it?"
- "Day-wise analysis"
- "Show me detailed insights"

**JUST CHAT (no tool)** - When user:
- Greets you ("Hi", "Hello")
- Asks general questions ("What can you do?")
- Asks about existing goals/memories (use context above)
- Wants advice (use memories and context)

=== TOOL FORMATS ===

1. create_goal:
{ "tool": "create_goal", "title": "Goal Name", "target_amount": 50000, "deadline": "2025-01-31", "metric_type": "net_profit", "start_tracking_date": "2025-01-01", "is_recurring": false }

For EMI/Manual goals:
{ "tool": "create_goal", "title": "January EMI", "target_amount": 20000, "deadline": "2025-01-05", "metric_type": "manual_check" }

For margin goals (percentage):
{ "tool": "create_goal", "title": "25% Margin Goal", "target_amount": 25, "metric_type": "margin", "start_tracking_date": "2025-01-01" }

2. update_goal:
{ "tool": "update_goal", "goal_id": "uuid-or-null", "search_title": "bike", "updates": { "target_amount": 60000, "deadline": "2025-02-28", "current_amount": 30000 } }

3. delete_goal:
{ "tool": "delete_goal", "goal_id": "uuid-or-null", "search_title": "bike" }

4. complete_goal:
{ "tool": "complete_goal", "goal_id": "uuid-or-null", "search_title": "emi" }

5. allocate_goal:
{ "tool": "allocate_goal", "goal_id": "uuid-or-null", "search_title": "bike", "amount": 10000 }

6. add_surplus:
{ "tool": "add_surplus", "goal_id": "uuid-or-null", "search_title": "bike" }

7. save_memory:
{ "tool": "save_memory", "content": "Shop closes at 9pm", "bucket": "fact" }

8. update_memory:
{ "tool": "update_memory", "memory_id": "uuid-or-null", "search_text": "closes at", "new_content": "Shop closes at 8pm" }

9. delete_memory:
{ "tool": "delete_memory", "memory_id": "uuid-or-null", "search_text": "closes at" }

10. get_financial_report:
{ "tool": "get_financial_report", "start_date": "2025-01-01", "end_date": "2025-01-13" }

11. get_customers:
{ "tool": "get_customers" }

12. get_products:
{ "tool": "get_products" }

13. get_suppliers:
{ "tool": "get_suppliers" }

14. get_pending_payments:
{ "tool": "get_pending_payments" }

15. get_payables:
{ "tool": "get_payables" }

16. get_recent_activity:
{ "tool": "get_recent_activity" }

17. get_business_summary:
{ "tool": "get_business_summary" }

18. get_business_analysis (DETAILED - margins, contributions, credit cycle):
{ "tool": "get_business_analysis", "start_date": "2025-01-01", "end_date": "2025-01-15" }
If no dates specified, defaults to this month.

19. get_detailed_insights (Product-Customer mapping, Day-wise analysis):
{ "tool": "get_detailed_insights", "start_date": "2025-01-01", "end_date": "2025-01-15" }
Shows: Which customer buys which product, best days for sales, product margins with buyers.

=== CRITICAL RULES ===
1. OUTPUT ONLY JSON when using a tool. No extra text, no markdown code blocks.
2. Use goal_id/memory_id from context if available. Otherwise use search_title/search_text.
3. CONVERT dates: "next month" → actual YYYY-MM-DD, "this week" → date range
4. CONVERT amounts: "50k" → 50000, "1 lakh" → 100000, "2L" → 200000
5. DETECT goal type from context:
   - "margin", "25%" → metric_type: "margin"
   - "profit", "save", "EMI" + no auto-tracking → metric_type: "manual_check"
   - "revenue", "sales" → metric_type: "revenue"
   - "customers" → metric_type: "customer_count"
6. For non-recurring auto-tracked goals, include start_tracking_date (default: today). For recurring (monthly/weekly), start date is automatic (1st of period).
7. Be conversational and friendly. Use emojis occasionally 😊
8. NEVER invent data - only use information from context above.
9. USE MEMORIES to personalize responses (greet by name, remember preferences)

=== ASKING CLARIFYING QUESTIONS ===
**NEVER GUESS. Always ask if information is missing.**

When user says something vague, ASK before creating anything:

**Missing Target Amount:**
User: "I want to save for a bike"
You: "Great idea! 🏍️ How much do you want to save for the bike? And by when?"

**Missing Deadline:**
User: "Set a profit goal of 1 lakh"
You: "Got it! When do you want to achieve this 1 lakh profit goal? This month? By a specific date?"

**Unclear Goal Type:**
User: "Create a goal for 50k"
You: "Sure! What's this 50k goal for? Is it:
- A savings target (EMI, purchase)?
- A profit target (auto-track from sales)?
- A revenue target?"

**Ambiguous Reference:**
User: "Delete it" or "Update the goal"
You: "Which goal would you like me to [delete/update]? You have: [list goals from context]"

**Multiple Goals Match:**
User: "Update my car goal" (but there are 2 car-related goals)
You: "I found multiple goals that might match. Which one?
1. Car EMI - ₹20,000
2. New Car Fund - ₹5,00,000"

**Missing Memory Details:**
User: "Remember this"
You: "Sure! What would you like me to remember? 📝"

**Unclear Financial Query:**
User: "Show me sales"
You: "For what time period? Today, this week, this month, or a custom range?"

**REMEMBER:**
- It's better to ask ONE clear question than make wrong assumptions
- After user answers, proceed with the action immediately
- Keep questions short and offer options when possible

=== ⚠️ ANTI-HALLUCINATION RULES (CRITICAL) ===

**NEVER LIE ABOUT DATA. NEVER INVENT NUMBERS.**

1. **ONLY USE REAL DATA FROM CONTEXT**
   - Goals: Only reference goals listed in "Active Goals" section above
   - Memories: Only reference memories listed in "Active Memories" section above
   - Surplus: Only use the "Available Surplus" number shown above

2. **FOR FINANCIAL QUESTIONS (sales, profit, revenue, expenses):**
   - ALWAYS use get_financial_report tool FIRST
   - NEVER guess or estimate numbers
   - If user asks "How much profit did I make?" → Use the tool, then report REAL numbers
   - If user asks "Who bought what?" → Say "I need to check the database" and use the tool

3. **IF DATA IS NOT AVAILABLE:**
   - Say: "I don't have that specific information. Let me check..." then use appropriate tool
   - Or say: "That data isn't in my current context. Could you be more specific about the time period?"
   - NEVER make up numbers like "approximately ₹50,000" unless you got it from the tool

4. **ADMIT WHEN YOU DON'T KNOW:**
   - "I don't see any goals matching that name in your current list"
   - "I don't have sales data from that period. Would you like me to fetch it?"
   - "I can't find that memory. Maybe it was deleted?"

5. **NEVER DO THESE:**
   ❌ "Your profit was around ₹40,000" (without checking)
   ❌ "You probably made about 50 sales" (guessing)
   ❌ "I think you had expenses of ₹10,000" (inventing)
   ❌ "Based on your usual pattern..." (hallucinating patterns)

6. **ALWAYS DO THESE:**
   ✅ Use get_financial_report tool before answering ANY data question
   ✅ Quote exact numbers from tool results
   ✅ Say "According to your records..." before stating facts
   ✅ If no data exists, say "No records found for that period"

7. **HONESTY PHRASES:**
   - "Let me check your actual data..."
   - "According to your database..."
   - "Your records show..."
   - "I don't have information about that. Can you tell me more?"
   - "I can only see data from [date range]. Would you like me to look at a different period?"

**THE GOLDEN RULE: If you don't know it from the CONTEXT or a TOOL RESULT, DON'T SAY IT.**

`;





        // 3. Prepare Messages
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
        ];

        // 4. Call Mistral
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: 'mistral-large-latest',
                messages: messages,
                temperature: 0.3, // Lower temperature for more deterministic tool calling
                max_tokens: 500,
            })
        });

        if (!response.ok) {
            throw new Error(`AI API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        const usage = {
            used: data.usage?.total_tokens || 0,
            limit: 1000000,
            resetInSeconds: null
        };

        // 5. Parse Response for JSON Tool Call
        let toolAction: any = null;
        try {
            // Attempt to find JSON in the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                toolAction = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            // Not valid JSON, treat as text response
            toolAction = null;
        }

        // 6. Handle Tool Actions
        if (toolAction && toolAction.tool) {
            console.log('[Enhanced AI] Tool Detected:', toolAction);

            // --- GOAL ACTIONS ---
            if (toolAction.tool === 'create_goal') {
                const { title, target_amount, deadline, is_recurring, recurrence_type, metric_type, start_tracking_date } = toolAction;
                const detectedMetricType = metric_type || 'manual_check';

                let startDate = start_tracking_date;
                // Auto-calculate start date for recurring goals
                if (recurrence_type === 'monthly') {
                    startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
                } else if (recurrence_type === 'weekly') {
                    startDate = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'); // Monday start
                } else if (!startDate) {
                    startDate = format(new Date(), 'yyyy-MM-dd');
                }

                return {
                    text: `I'll create a new goal: **${title}** (Target: ${['margin', 'daily_margin', 'avg_margin'].includes(detectedMetricType) ? target_amount + '%' : '₹' + target_amount?.toLocaleString()})`,
                    usage,
                    pendingAction: {
                        id: `create-goal-${Date.now()}`,
                        type: 'create_goal',
                        description: `Create Goal: ${title}`,
                        data: {
                            title,
                            targetAmount: target_amount,
                            deadline,
                            isRecurring: is_recurring,
                            recurrenceType: recurrence_type,
                            metricType: detectedMetricType,
                            startTrackingDate: startDate
                        }
                    }
                };
            }

            if (toolAction.tool === 'update_goal') {
                const { goal_id, search_title, updates } = toolAction;
                // Identify goal
                let targetGoal = null;
                if (goal_id) targetGoal = goals.find(g => g.id === goal_id);
                if (!targetGoal && search_title) targetGoal = goals.find(g => g.title.toLowerCase().includes(search_title.toLowerCase()));

                if (!targetGoal && goals.length === 1) targetGoal = goals[0]; // Auto-select if single goal

                if (targetGoal) {
                    return {
                        text: `I'll update the goal **${targetGoal.title}**.`,
                        usage,
                        pendingAction: {
                            id: `update-goal-${Date.now()}`,
                            type: 'update_goal',
                            description: `Update Goal: ${targetGoal.title}`,
                            data: {
                                goalTitle: targetGoal.title,
                                updates: {
                                    targetAmount: updates.target_amount,
                                    deadline: updates.deadline,
                                    newTitle: updates.new_title,
                                    addAmount: updates.add_amount,
                                    currentAmount: updates.current_amount,
                                    isRecurring: updates.is_recurring,
                                    recurrenceType: updates.recurrence_type,
                                    startDate: updates.start_date
                                }
                            }
                        }
                    };
                } else {
                    return { text: `I couldn't find the goal "${search_title}". Here are your goals:\n${goalsText}`, usage };
                }
            }

            if (toolAction.tool === 'delete_goal') {
                const { goal_id, search_title } = toolAction;
                let targetGoal = null;
                if (goal_id) targetGoal = goals.find(g => g.id === goal_id);
                if (!targetGoal && search_title) targetGoal = goals.find(g => g.title.toLowerCase().includes(search_title.toLowerCase()));

                if (targetGoal) {
                    return {
                        text: `Are you sure you want to delete **${targetGoal.title}**?`,
                        usage,
                        pendingAction: {
                            id: `delete-goal-${Date.now()}`,
                            type: 'delete_goal',
                            description: `Delete Goal: ${targetGoal.title}`,
                            data: { searchTitle: targetGoal.title }
                        }
                    };
                }
                return { text: `I couldn't find a goal to delete matching "${search_title}".`, usage };
            }

            if (toolAction.tool === 'complete_goal') {
                const { goal_id, search_title } = toolAction;
                let targetGoal = null;
                if (goal_id) targetGoal = goals.find(g => g.id === goal_id);
                if (!targetGoal && search_title) targetGoal = goals.find(g => g.title.toLowerCase().includes(search_title.toLowerCase()));

                if (targetGoal) {
                    return {
                        text: `Great job! Marking **${targetGoal.title}** as complete?`,
                        usage,
                        pendingAction: {
                            id: `complete-goal-${Date.now()}`,
                            type: 'complete_goal',
                            description: `Complete Goal: ${targetGoal.title}`,
                            data: { goalTitle: targetGoal.title, goalId: targetGoal.id }
                        }
                    };
                }
                return { text: `I couldn't find that goal.`, usage };
            }

            if (toolAction.tool === 'allocate_goal') {
                const { goal_id, search_title, amount } = toolAction;
                let targetGoal = null;
                if (goal_id) targetGoal = goals.find(g => g.id === goal_id);
                if (!targetGoal && search_title) targetGoal = goals.find(g => g.title.toLowerCase().includes(search_title.toLowerCase()));

                // Use surplus if amount not specified but implied? 
                // The prompt logic should handle specific amounts usually.
                const allocAmount = amount || 0;

                if (targetGoal) {
                    return {
                        text: `Allocating ₹${allocAmount.toLocaleString()} to **${targetGoal.title}**.`,
                        usage,
                        pendingAction: {
                            id: `allocate-${Date.now()}`,
                            type: 'allocate_goal',
                            description: `Allocate ₹${allocAmount} to ${targetGoal.title}`,
                            data: {
                                goalId: targetGoal.id,
                                goalTitle: targetGoal.title,
                                amount: allocAmount,
                                source: 'manual'
                            }
                        }
                    };
                }
                return { text: "Goal not found for allocation.", usage };
            }

            if (toolAction.tool === 'add_surplus') {
                const { goal_id, search_title } = toolAction;
                let targetGoal = null;
                if (goal_id) targetGoal = goals.find(g => g.id === goal_id);
                if (!targetGoal && search_title) targetGoal = goals.find(g => g.title.toLowerCase().includes(search_title.toLowerCase()));

                if (targetGoal) {
                    return {
                        text: `Adding surplus (₹${surplus.toLocaleString()}) to **${targetGoal.title}**.`,
                        usage,
                        pendingAction: {
                            id: `add-surplus-${Date.now()}`,
                            type: 'add_surplus',
                            description: `Add Surplus to ${targetGoal.title}`,
                            data: { goalTitle: targetGoal.title }
                        }
                    };
                }
                return { text: "Goal not found to add surplus.", usage };
            }


            // --- MEMORY ACTIONS ---
            if (toolAction.tool === 'save_memory') {
                return {
                    text: `I'll remember that: "${toolAction.content}"`,
                    usage,
                    pendingAction: {
                        id: `memory-${Date.now()}`,
                        type: 'save_memory',
                        description: `Save Memory`,
                        data: { content: toolAction.content, bucket: toolAction.bucket || 'fact' }
                    }
                };
            }

            if (toolAction.tool === 'delete_memory') {
                const { memory_id, search_text } = toolAction;
                // Find memory
                let targetMem = null;
                if (memory_id) targetMem = memories.find(m => m.id === memory_id);
                if (!targetMem && search_text) targetMem = memories.find(m => m.content.includes(search_text));

                if (targetMem) {
                    return {
                        text: `Delete this memory? "${targetMem.content}"`,
                        usage,
                        pendingAction: {
                            id: `delete-memory-${Date.now()}`,
                            type: 'delete_memory',
                            description: `Delete Memory`,
                            data: { memoryId: targetMem.id, searchText: targetMem.content }
                        }
                    };
                }
                return { text: "Memory not found.", usage };
            }

            if (toolAction.tool === 'update_memory') {
                const { memory_id, search_text, new_content } = toolAction;
                let targetMem = null;
                if (memory_id) targetMem = memories.find(m => m.id === memory_id);
                if (!targetMem && search_text) targetMem = memories.find(m => m.content.includes(search_text));

                if (targetMem) {
                    return {
                        text: `Update memory to: "${new_content}"?`,
                        usage,
                        pendingAction: {
                            id: `update-memory-${Date.now()}`,
                            type: 'update_memory',
                            description: `Update Memory`,
                            data: { memoryId: targetMem.id, searchText: targetMem.content, newContent: new_content }
                        }
                    };
                }
                return { text: "Memory not found to update.", usage };
            }

            // --- FINANCIAL REPORT ---
            if (toolAction.tool === 'get_financial_report') {
                let { start_date, end_date } = toolAction;
                if (!start_date) start_date = format(startOfMonth(new Date()), 'yyyy-MM-dd');
                if (!end_date) end_date = format(new Date(), 'yyyy-MM-dd');

                const report = await toolGetFinancialData(start_date, end_date);
                return {
                    text: report,
                    usage
                };
            }

            // --- DATA QUERY TOOLS ---
            if (toolAction.tool === 'get_customers') {
                const customerData = await toolGetCustomerData();
                return { text: customerData, usage };
            }

            if (toolAction.tool === 'get_products') {
                const productData = await toolGetProductData();
                return { text: productData, usage };
            }

            if (toolAction.tool === 'get_suppliers') {
                const supplierData = await toolGetSupplierData();
                return { text: supplierData, usage };
            }

            if (toolAction.tool === 'get_pending_payments') {
                const paymentData = await toolGetPaymentReminders();
                return { text: paymentData, usage };
            }

            if (toolAction.tool === 'get_payables') {
                const payablesData = await toolGetAccountsPayable();
                return { text: payablesData, usage };
            }

            if (toolAction.tool === 'get_recent_activity') {
                const activityData = await toolGetRecentActivity();
                return { text: activityData, usage };
            }

            if (toolAction.tool === 'get_business_summary') {
                const summaryData = await toolGetBusinessSummary();
                return { text: summaryData, usage };
            }

            if (toolAction.tool === 'get_business_analysis') {
                const { start_date, end_date } = toolAction;
                const analysisData = await toolGetBusinessAnalysis(start_date, end_date);
                return { text: analysisData, usage };
            }

            if (toolAction.tool === 'get_detailed_insights') {
                const { start_date, end_date } = toolAction;
                const insightsData = await toolGetDetailedInsights(start_date, end_date);
                return { text: insightsData, usage };
            }
        }

        // 7. Fallback to Text Response
        return {
            text: content || "I didn't understand that.",
            usage
        };

    } catch (error) {
        console.error('Enhanced AI Error:', error);
        return {
            text: "My brain is fuzzy right now. Please try again.",
            usage: { used: 0, limit: 0, resetInSeconds: null }
        };
    }
}

// Execute pending action
export async function executePendingAction(action: PendingAction): Promise<string> {
    console.log('[Enhanced AI] Executing Action:', action);
    const { type, data } = action;

    // --- GOAL ACTIONS ---
    if (type === 'create_goal') {
        const goal = await addGoal({
            title: data.title,
            target_amount: data.targetAmount,
            deadline: data.deadline,
            metric_type: data.metricType || 'manual_check',
            start_tracking_date: data.startTrackingDate || new Date().toISOString().split('T')[0]
        });
        return goal ? `✅ Created goal: **${goal.title}**` : "Failed to create goal.";
    }

    if (type === 'update_goal') {
        if (!data.goalId) return "Goal ID missing.";
        const updates: any = {};
        if (data.updates.newTitle) updates.title = data.updates.newTitle;
        if (data.updates.targetAmount) updates.target_amount = data.updates.targetAmount;
        if (data.updates.deadline) updates.deadline = data.updates.deadline;
        if (data.updates.currentAmount !== undefined) updates.current_amount = data.updates.currentAmount;

        const success = await updateGoal(data.goalId, updates);
        return success ? `Updated goal: ${data.goalTitle}` : "Failed to update goal.";
    }

    if (type === 'delete_goal') {
        if (!data.goalId) return "Goal ID missing.";
        const success = await deleteGoal(data.goalId);
        return success ? `Deleted goal: ${data.searchTitle}` : "Failed to delete goal.";
    }

    if (type === 'complete_goal') {
        if (!data.goalId) return "Goal ID missing.";
        const success = await completeGoalWithTimestamp(data.goalId);
        return success ? `Marked ${data.goalTitle} as complete! 🎉` : "Failed to complete goal.";
    }

    if (type === 'allocate_goal' || type === 'add_surplus') {
        if (!data.goalId) return "Goal ID missing.";
        const success = await allocateToGoal(data.goalId, data.amount, 'manual');
        return success ? `Allocated ₹${data.amount.toLocaleString()} to ${data.goalTitle}.` : "Failed to allocate funds.";
    }

    // --- MEMORY ACTIONS ---
    if (type === 'save_memory') {
        const result = await addMemory(data.bucket, data.content);
        return result ? "Saved to memory." : "Failed to save memory.";
    }

    if (type === 'delete_memory') {
        if (!data.memoryId) return "Memory ID missing.";
        const success = await deleteMemory(data.memoryId);
        return success ? "Memory deleted." : "Failed to delete memory.";
    }

    if (type === 'update_memory') {
        if (!data.memoryId) return "Memory ID missing.";
        const success = await updateMemory(data.memoryId, data.newContent);
        return success ? "Memory updated." : "Failed to update memory.";
    }

    return "Unknown action.";
}

// Quick queries shortcut
export async function handleEnhancedQuickQuery(queryType: string): Promise<AIResponse> {
    const prompts: Record<string, string> = {
        'unpaid_this_week': "Who hasn't paid me yet? Show me all pending payments.",
        'weekly_comparison': "How are my sales this week compared to last week?",
        'top_product': "What's my best selling product this month?",
        'late_payers': "Which customers are delaying payments the most?",
        'daily_focus': "What should I focus on today based on my pending tasks and goals?",
        'goal_check': "How am I doing on my goals? Give me a progress update.",
        'emi_status': "What's my EMI status? Do I have enough to pay?",
        'business_summary': "Give me a complete overview of how my business is doing.",
        'top_customers': "Who are my top customers? Show me customer data.",
        'recent_activity': "What happened in my business recently?",
        'supplier_payments': "What do I owe to my suppliers?",
        'todays_profit': "How much profit did I make today?"
    };

    const userPrompt = prompts[queryType] || "Tell me about my business status.";
    return enhancedChatWithAI(userPrompt, []);
}

// Export clusters (Empty for now to prevent breaking imports if any, though grep showed none)
export const GoalNLPClusters = {};
