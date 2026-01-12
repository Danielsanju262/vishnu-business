/**
 * Enhanced AI Chat System with Tool Usage
 * This AI can query the database, track goals, and manage memories
 */

import { supabase } from './supabase';
import { format, subDays, subMonths, startOfMonth, endOfMonth, addDays } from 'date-fns';
import {
    getActiveMemories,
    getActiveGoals,
    addMemory,
    updateMemory,
    deleteMemory,
    addGoal,
    updateGoal,
    deleteGoal,
    completeGoal,
    calculateWaterfallGoals
} from './aiMemory';

// Mistral AI Configuration
const MISTRAL_API_KEY = 'ZUfHndqE4M5ES7S0aXwHsyE9s8oPs0cr';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

// ===== TOOL DEFINITIONS =====
interface ToolResult {
    name: string;
    result: string;
}

// Tool: Get Financial Data for Any Date Range
async function toolGetFinancialData(startDate: string, endDate: string): Promise<string> {
    try {
        // Sales data - fetch ALL transactions for accurate totals
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
        const salesCount = sales?.length || 0;

        // Expenses data
        const { data: expenses } = await supabase
            .from('expenses')
            .select('amount, category, note, date')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null);

        const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
        const netProfit = grossProfit - totalExpenses;

        // Top products
        const productSales: Record<string, { qty: number; revenue: number }> = {};
        (sales || []).forEach((s: any) => {
            const name = s.products?.name || 'Unknown';
            if (!productSales[name]) productSales[name] = { qty: 0, revenue: 0 };
            productSales[name].qty += s.quantity;
            productSales[name].revenue += s.sell_price * s.quantity;
        });

        const topProducts = Object.entries(productSales)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .slice(0, 5)
            .map(([name, data]) => `${name}: ${data.qty} units, ₹${data.revenue.toLocaleString()}`);

        // Top customers
        const customerSales: Record<string, number> = {};
        (sales || []).forEach((s: any) => {
            const name = s.customers?.name || 'Unknown';
            customerSales[name] = (customerSales[name] || 0) + (s.sell_price * s.quantity);
        });

        const topCustomers = Object.entries(customerSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, rev]) => `${name}: ₹${rev.toLocaleString()}`);

        // Expense breakdown
        const expenseByCategory: Record<string, number> = {};
        (expenses || []).forEach(e => {
            const cat = e.category || 'Other';
            expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount);
        });

        const expenseBreakdown = Object.entries(expenseByCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => `${cat}: ₹${amt.toLocaleString()}`);

        return `FINANCIAL DATA (${startDate} to ${endDate}):
📊 Summary:
- Total Revenue: ₹${totalRevenue.toLocaleString()}
- Total Cost (COGS): ₹${totalCost.toLocaleString()}
- Gross Profit: ₹${grossProfit.toLocaleString()}
- Total Expenses: ₹${totalExpenses.toLocaleString()}
- NET PROFIT: ₹${netProfit.toLocaleString()}
- Number of Sales: ${salesCount}

🏆 Top Products:
${topProducts.join('\n') || 'No data'}

👥 Top Customers:
${topCustomers.join('\n') || 'No data'}

💸 Expense Breakdown:
${expenseBreakdown.join('\n') || 'No expenses'}`;
    } catch (error) {
        console.error('[AI Tool] Financial data error:', error);
        return 'Error fetching financial data.';
    }
}

// Tool: Get Pending Receivables (Who Owes Money)
async function toolGetPendingReceivables(): Promise<string> {
    try {
        const { data: reminders } = await supabase
            .from('payment_reminders')
            .select('amount, due_date, note, customers(name)')
            .eq('status', 'pending')
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

        if (!reminders || reminders.length === 0) {
            return 'No pending receivables. Everyone has paid! 🎉';
        }

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lines = reminders.map((r: any) => {
            const daysDiff = Math.ceil((new Date(r.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const status = r.due_date < todayStr ? `⚠️ OVERDUE by ${Math.abs(daysDiff)} days` :
                r.due_date === todayStr ? '🔔 DUE TODAY' :
                    `Due in ${daysDiff} days`;
            return `- ${r.customers?.name || 'Unknown'}: ₹${Number(r.amount).toLocaleString()} (${status})`;
        });

        const totalPending = reminders.reduce((sum, r) => sum + Number(r.amount), 0);
        const overdueCount = reminders.filter((r: any) => r.due_date < todayStr).length;

        return `PENDING RECEIVABLES:
Total: ₹${totalPending.toLocaleString()} from ${reminders.length} customers
Overdue: ${overdueCount} payments

${lines.join('\n')}`;
    } catch (error) {
        console.error('[AI Tool] Receivables error:', error);
        return 'Error fetching receivables.';
    }
}

// Tool: Get Pending Payables (What You Owe)
async function toolGetPendingPayables(): Promise<string> {
    try {
        const { data: payables } = await supabase
            .from('accounts_payable')
            .select('amount, due_date, note, suppliers(name)')
            .eq('status', 'pending')
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

        if (!payables || payables.length === 0) {
            return 'No pending payables. All bills are cleared! 🎉';
        }

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lines = payables.map((p: any) => {
            const daysDiff = Math.ceil((new Date(p.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const status = p.due_date < todayStr ? `⚠️ OVERDUE by ${Math.abs(daysDiff)} days` :
                p.due_date === todayStr ? '🔔 DUE TODAY' :
                    `Due in ${daysDiff} days`;
            return `- ${p.suppliers?.name || 'Unknown'}: ₹${Number(p.amount).toLocaleString()} (${status})`;
        });

        const totalPending = payables.reduce((sum, p) => sum + Number(p.amount), 0);
        const overdueCount = payables.filter((p: any) => p.due_date < todayStr).length;

        return `PENDING PAYABLES:
Total: ₹${totalPending.toLocaleString()} to ${payables.length} suppliers
Overdue: ${overdueCount} payments

${lines.join('\n')}`;
    } catch (error) {
        console.error('[AI Tool] Payables error:', error);
        return 'Error fetching payables.';
    }
}

// Tool: Get Goal Progress (Waterfall Method)
async function toolGetGoalProgress(): Promise<string> {
    try {
        const waterfallGoals = await calculateWaterfallGoals();

        if (waterfallGoals.length === 0) {
            return 'NO ACTIVE GOALS. The user has not set any goals yet.';
        }

        const goalLines = waterfallGoals.map((g, index) => {
            const statusEmoji = g.isFullyFunded ? '✅' : g.daysLeft < 3 ? '🔥' : '📈';
            const deadlineInfo = g.goal.deadline ? `Deadline: ${g.goal.deadline}` : 'No deadline set';
            const recurringInfo = g.goal.is_recurring ? ` (Recurring: ${g.goal.recurrence_type})` : '';
            return `${index + 1}. ${statusEmoji} "${g.goal.title}"${recurringInfo}
   - Target Amount: ₹${g.goal.target_amount.toLocaleString()}
   - Funds Allocated from Net Profit: ₹${g.allocatedAmount.toLocaleString()}
   - Remaining Needed: ₹${g.remainingNeeded.toLocaleString()}
   - ${deadlineInfo} (${g.daysLeft >= 0 ? `${g.daysLeft} days left` : `${Math.abs(g.daysLeft)} days overdue`})
   - Tracking Since: ${g.goal.start_tracking_date?.split('T')[0] || 'N/A'}
   - Status: ${g.statusMessage}`;
        });

        return `ACTIVE GOALS (${waterfallGoals.length} total, ordered by priority):\n\n${goalLines.join('\n\n')}`;
    } catch (error) {
        console.error('[AI Tool] Goals error:', error);
        return 'Error fetching goals.';
    }
}

// Tool: Save a Memory/Fact
async function toolSaveMemory(content: string, bucket: 'preference' | 'fact' | 'context' = 'fact'): Promise<string> {
    try {
        console.log('[AI Tool] Saving memory:', { bucket, content });

        // Check memory count first
        const existingMemories = await getActiveMemories();
        if (existingMemories.length >= 35) {
            return `❌ Cannot save memory. You've reached the maximum limit of 35 memories.\n\nPlease delete some old memories from Settings > AI Memory before adding new ones.`;
        }

        const memory = await addMemory(bucket, content);
        if (memory) {
            console.log('[AI Tool] Memory saved successfully:', memory);
            return `✅ Saved ${bucket} to memory: "${content}"\n\nThis will be remembered in future conversations. You can view/edit it in Settings > AI Memory.`;
        }
        console.error('[AI Tool] Memory save returned null');
        return '❌ Failed to save memory. Database operation failed.';
    } catch (error) {
        console.error('[AI Tool] Save memory error:', error);
        return `❌ Error saving memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

// Tool: Delete a Memory by content match
async function toolDeleteMemory(searchText: string): Promise<string> {
    try {
        const memories = await getActiveMemories();
        const match = memories.find(m =>
            m.content.toLowerCase().includes(searchText.toLowerCase())
        );

        if (match) {
            await deleteMemory(match.id);
            return `✅ Deleted memory: "${match.content}"`;
        }
        return `❌ No memory found matching "${searchText}"`;
    } catch (error) {
        console.error('[AI Tool] Delete memory error:', error);
        return 'Error deleting memory.';
    }
}

// Tool: Update a Memory
async function toolUpdateMemoryContent(searchText: string, newContent: string): Promise<string> {
    try {
        const memories = await getActiveMemories();
        const match = memories.find(m =>
            m.content.toLowerCase().includes(searchText.toLowerCase())
        );

        if (match) {
            await updateMemory(match.id, newContent);
            return `✅ Updated memory from "${match.content}" to "${newContent}"`;
        }
        return `❌ No memory found matching "${searchText}"`;
    } catch (error) {
        console.error('[AI Tool] Update memory error:', error);
        return 'Error updating memory.';
    }
}

// Tool: Create a New Goal
async function toolCreateGoal(
    title: string,
    targetAmount: number,
    deadline?: string,
    metricType: 'net_profit' | 'revenue' | 'sales_count' | 'manual_check' = 'net_profit',
    isRecurring: boolean = false,
    recurrenceType?: 'monthly' | 'weekly' | 'yearly'
): Promise<string> {
    try {
        console.log('[AI Tool] Creating goal:', { title, targetAmount, deadline, metricType, isRecurring, recurrenceType });

        const goal = await addGoal({
            title,
            target_amount: targetAmount,
            deadline: deadline,
            metric_type: metricType,
            start_tracking_date: new Date().toISOString(),
            is_recurring: isRecurring,
            recurrence_type: recurrenceType
        });

        const recurrenceText = isRecurring ? ` (${recurrenceType})` : '';
        if (goal) {
            console.log('[AI Tool] Goal created successfully:', goal);
            // Dispatch event to refresh dashboard
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }
            return `✅ Goal created successfully!\n- Title: "${title}"\n- Target: ₹${targetAmount.toLocaleString()}\n- Deadline: ${deadline || 'No deadline'}\n- Type: ${metricType}${recurrenceText}\n\nYou can view it at Insights > Goals.`;
        }
        console.error('[AI Tool] Goal creation returned null - check database connection and schema');
        return '❌ Failed to create goal. The goal data was valid, but the database operation failed. Please check that the user_goals table has all required columns (is_recurring, recurrence_type).';
    } catch (error) {
        console.error('[AI Tool] Create goal error:', error);
        return `❌ Error creating goal: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

// Tool: Update Goal Progress or Details
async function toolUpdateGoalProgress(searchTitle: string, updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly'; currentAmount?: number; addAmount?: number }): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            const updateData: any = {};
            let message = '';

            if (updates.targetAmount) {
                updateData.target_amount = updates.targetAmount;
                message += ` Target: ₹${updates.targetAmount.toLocaleString()}.`;
            }
            if (updates.deadline) {
                updateData.deadline = updates.deadline;
                message += ` Deadline: ${updates.deadline}.`;
            }
            if (updates.isRecurring !== undefined) {
                updateData.is_recurring = updates.isRecurring;
                message += ` Recurring: ${updates.isRecurring}.`;
            }
            if (updates.recurrenceType) {
                updateData.recurrence_type = updates.recurrenceType;
                message += ` Type: ${updates.recurrenceType}.`;
            }

            // Handle Progress Updates
            if (updates.currentAmount !== undefined) {
                updateData.current_amount = updates.currentAmount;
                updateData.metric_type = 'manual_check'; // Switch to manual so it sticks
                message += ` Progress set to: ₹${updates.currentAmount.toLocaleString()}. (Switched to manual tracking)`;
            } else if (updates.addAmount !== undefined) {
                updateData.current_amount = (match.current_amount || 0) + updates.addAmount;
                updateData.metric_type = 'manual_check'; // Switch to manual so it sticks
                message += ` Added ₹${updates.addAmount.toLocaleString()} to progress. New total: ₹${updateData.current_amount.toLocaleString()}. (Switched to manual tracking)`;
            }

            if (Object.keys(updateData).length > 0) {
                await updateGoal(match.id, updateData);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('goal-updated'));
                }
                return `✅ Updated goal "${match.title}":${message}`;
            } else {
                return `ℹ️ No changes needed for goal "${match.title}".`;
            }
        }
        return `❌ No goal found matching "${searchTitle}"`;
    } catch (error) {
        console.error('[AI Tool] Update goal error:', error);
        return 'Error updating goal.';
    }
}

// Tool: Complete a Goal
async function toolCompleteGoal(searchTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            await completeGoal(match.id);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }
            return `🎉 Marked goal "${match.title}" as complete! Great job!`;
        }
        return `❌ No active goal found matching "${searchTitle}"`;
    } catch (error) {
        console.error('[AI Tool] Complete goal error:', error);
        return 'Error completing goal.';
    }
}

// Tool: Delete/Archive a Goal
async function toolDeleteGoal(searchTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            await deleteGoal(match.id);

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }
            return `✅ Deleted goal: "${match.title}"`;
        }
        return `❌ No goal found matching "${searchTitle}"`;
    } catch (error) {
        console.error('[AI Tool] Delete goal error:', error);
        return 'Error deleting goal.';
    }
}

// Parse goal creation from natural language
function parseGoalFromMessage(message: string): { title: string; target: number; deadline?: string; isRecurring: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly' } | null {
    const lowerMessage = message.toLowerCase();

    // Look for patterns like "goal: earn 50000" or "set goal 50k profit"
    const amountMatch = message.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|L)?/);
    if (!amountMatch) return null;

    let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (lowerMessage.includes('k') || lowerMessage.includes('K')) {
        amount *= 1000;
    } else if (lowerMessage.includes('lakh') || lowerMessage.includes('L')) {
        amount *= 100000;
    }

    // Extract title - clean up common words
    let title = message
        .replace(/set\s*(a\s*)?goal:?/i, '')
        .replace(/create\s*(a\s*)?goal:?/i, '')
        .replace(/new\s*goal:?/i, '')
        .replace(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|L)?/, '')
        .replace(/this\s+month|this\s+week|by\s+\w+/gi, '')
        .trim();

    if (!title || title.length < 3) {
        title = `Earn ₹${amount.toLocaleString()}`;
    }

    // Check for deadline mentions
    let deadline: string | undefined;
    const today = new Date();

    if (lowerMessage.includes('this month')) {
        deadline = format(endOfMonth(today), 'yyyy-MM-dd');
    } else if (lowerMessage.includes('this week')) {
        deadline = format(addDays(today, 7 - today.getDay()), 'yyyy-MM-dd');
    } else if (lowerMessage.includes('next month')) {
        deadline = format(endOfMonth(addDays(today, 30)), 'yyyy-MM-dd');
    }

    // Check for specific date mentions
    const dateMatch = message.match(/by\s+(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1;
        const year = dateMatch[3] ? parseInt(dateMatch[3]) : today.getFullYear();
        deadline = format(new Date(year, month, day), 'yyyy-MM-dd');
    }

    // Check for recurrence
    let isRecurring = false;
    let recurrenceType: 'monthly' | 'weekly' | 'yearly' | undefined;

    if (lowerMessage.includes('monthly') || lowerMessage.includes('every month') || lowerMessage.includes('per month')) {
        isRecurring = true;
        recurrenceType = 'monthly';
    } else if (lowerMessage.includes('weekly') || lowerMessage.includes('every week') || lowerMessage.includes('per week')) {
        isRecurring = true;
        recurrenceType = 'weekly';
    } else if (lowerMessage.includes('yearly') || lowerMessage.includes('annually') || lowerMessage.includes('every year')) {
        isRecurring = true;
        recurrenceType = 'yearly';
    } else if (lowerMessage.includes('recurring')) {
        // Default to monthly if just "recurring" is said
        isRecurring = true;
        recurrenceType = 'monthly';
    }

    return { title, target: amount, deadline, isRecurring, recurrenceType };
}

// Parse date ranges from natural language
function parseDateRange(query: string): { startDate: string; endDate: string } | null {
    const lowerQuery = query.toLowerCase();
    const today = new Date();

    // Today
    if (lowerQuery.includes('today')) {
        const d = format(today, 'yyyy-MM-dd');
        return { startDate: d, endDate: d };
    }

    // Yesterday
    if (lowerQuery.includes('yesterday')) {
        const d = format(subDays(today, 1), 'yyyy-MM-dd');
        return { startDate: d, endDate: d };
    }

    // This week
    if (lowerQuery.includes('this week')) {
        const start = format(subDays(today, today.getDay()), 'yyyy-MM-dd');
        return { startDate: start, endDate: format(today, 'yyyy-MM-dd') };
    }

    // Last week
    if (lowerQuery.includes('last week')) {
        const start = format(subDays(today, today.getDay() + 7), 'yyyy-MM-dd');
        const end = format(subDays(today, today.getDay() + 1), 'yyyy-MM-dd');
        return { startDate: start, endDate: end };
    }

    // This month
    if (lowerQuery.includes('this month')) {
        return {
            startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
            endDate: format(today, 'yyyy-MM-dd')
        };
    }

    // Last month
    if (lowerQuery.includes('last month')) {
        const lastMonth = subMonths(today, 1);
        return {
            startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
            endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
        };
    }

    // Month name mentions (e.g., "in January", "January 2023")
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'];

    for (let i = 0; i < monthNames.length; i++) {
        if (lowerQuery.includes(monthNames[i])) {
            // Check for year
            const yearMatch = lowerQuery.match(/20\d{2}/);
            const year = yearMatch ? parseInt(yearMatch[0]) : today.getFullYear();

            const monthDate = new Date(year, i, 1);
            return {
                startDate: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(monthDate), 'yyyy-MM-dd')
            };
        }
    }

    // Last N days
    const daysMatch = lowerQuery.match(/last\s+(\d+)\s+days?/);
    if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        return {
            startDate: format(subDays(today, days), 'yyyy-MM-dd'),
            endDate: format(today, 'yyyy-MM-dd')
        };
    }

    // Year mentions (e.g., "in 2023", "2023")
    const yearOnlyMatch = lowerQuery.match(/\b(20\d{2})\b/);
    if (yearOnlyMatch && !monthNames.some(m => lowerQuery.includes(m))) {
        const year = parseInt(yearOnlyMatch[1]);
        return {
            startDate: `${year}-01-01`,
            endDate: `${year}-12-31`
        };
    }

    return null;
}

// Detect what tools to use based on the query
function detectRequiredTools(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const tools: string[] = [];

    // Financial/Sales/Profit queries
    if (lowerQuery.match(/sale|sold|revenue|profit|income|money|earn|business|perform|how.*(was|is|did)|show.*data|financial/)) {
        tools.push('financial');
    }

    // Receivables queries
    if (lowerQuery.match(/owe|owes|collect|receivable|pending.*payment|who.*pay|customer.*pay|remind/)) {
        tools.push('receivables');
    }

    // Payables queries
    if (lowerQuery.match(/pay\s+to|payable|supplier|vendor|bill|need.*to.*pay|i.*owe/)) {
        tools.push('payables');
    }

    // Goal queries (check progress)
    if (lowerQuery.match(/goal|target|progress|emi|track|achieve|how.*am.*i.*doing/)) {
        tools.push('goals');
    }

    // Goal creation
    if (lowerQuery.match(/set\s*(a\s*)?goal|create\s*(a\s*)?goal|new\s*goal|track\s*\d+|goal:?\s*\d+/)) {
        tools.push('create_goal');
    }

    // Goal completion
    if (lowerQuery.match(/complete\s*(my\s*)?goal|mark\s*(my\s*)?(goal|.*)\s*complete|finish\s*(my\s*)?goal|done\s*with\s*goal/i)) {
        tools.push('complete_goal');
    }

    // Goal deletion
    if (lowerQuery.match(/delete\s*(my\s*)?goal|remove\s*(my\s*)?goal|cancel\s*(my\s*)?goal/i)) {
        tools.push('delete_goal');
    }

    // Goal update
    if (lowerQuery.match(/update\s*(my\s*)?goal|change\s*(my\s*)?goal|modify\s*(my\s*)?goal|edit\s*(my\s*)?goal|add\s*.*\s*to\s*goal|increase\s*goal/i)) {
        tools.push('update_goal');
    }

    // Memory/Remember queries (saving)
    if (lowerQuery.match(/remember\s*(that)?|save\s*(this)?|note\s*(that)?|my name\s*(is)?|i\s*am\s*\w+|i\s*prefer|always|never/)) {
        tools.push('save_memory');
    }

    // Memory deletion
    if (lowerQuery.match(/forget\s*(about)?|delete\s*(my\s*)?memory|remove\s*(the\s*)?fact|stop\s*remembering/i)) {
        tools.push('delete_memory');
    }

    // Memory update
    if (lowerQuery.match(/update\s*(my\s*)?memory|change\s*(what\s*you\s*(know|remember))?|modify\s*(the\s*)?fact/i)) {
        tools.push('update_memory');
    }

    // Show all memories
    if (lowerQuery.match(/what\s*(do\s*)?you\s*(know|remember)|show\s*(my\s*)?(memories|facts)|list\s*(my\s*)?memories/i)) {
        tools.push('list_memories');
    }

    return tools;
}

// ===== MAIN CHAT FUNCTION =====
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// Pending action that requires user confirmation
export interface PendingAction {
    id: string;
    type: 'create_goal' | 'save_memory' | 'delete_goal' | 'delete_memory';
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

// Execute a confirmed pending action
export async function executePendingAction(action: PendingAction): Promise<string> {
    try {
        switch (action.type) {
            case 'create_goal': {
                const { title, targetAmount, deadline, metricType, isRecurring, recurrenceType } = action.data;
                const result = await toolCreateGoal(title, targetAmount, deadline, metricType, isRecurring, recurrenceType);
                return result;
            }
            case 'save_memory': {
                const { content, bucket } = action.data;
                const result = await toolSaveMemory(content, bucket);
                return result;
            }
            case 'delete_goal': {
                const { searchTitle } = action.data;
                const result = await toolDeleteGoal(searchTitle);
                return result;
            }
            case 'delete_memory': {
                const { searchText } = action.data;
                const result = await toolDeleteMemory(searchText);
                return result;
            }
            default:
                return '❌ Unknown action type.';
        }
    } catch (error) {
        console.error('[AI] Execute pending action error:', error);
        return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function enhancedChatWithAI(
    userMessage: string,
    history: ChatMessage[] = [],
    botName: string = 'Via AI',
    userName: string = ''
): Promise<AIResponse> {
    try {
        // 1. Get long-term memories
        const memories = await getActiveMemories();
        const memoriesText = memories.length > 0
            ? memories.map(m => `- [${m.bucket}] ${m.content}`).join('\n')
            : 'No memories stored yet.';

        // 2. Get active goals with Waterfall Context
        const waterfallGoals = await calculateWaterfallGoals();
        const goalsText = waterfallGoals.length > 0
            ? waterfallGoals.map((g, i) => {
                const deadlineInfo = g.goal.deadline ? `by ${g.goal.deadline}` : 'no deadline';
                const recurringInfo = g.goal.is_recurring ? ` (${g.goal.recurrence_type})` : '';
                return `${i + 1}. "${g.goal.title}"${recurringInfo}: Target ₹${g.goal.target_amount.toLocaleString()}, Needs ₹${g.remainingNeeded.toLocaleString()} more, ${deadlineInfo}. ${g.statusMessage}`;
            }).join('\n')
            : 'NO ACTIVE GOALS currently set.';

        // 3. Pre-fetch Current Month Financials for Context (crucial for accurate goal tracking)
        // This ensures the AI always knows the "current state" of business without needing a specific tool call every time
        const startOfCurrentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const todayDate = format(new Date(), 'yyyy-MM-dd');
        const currentMonthContext = await toolGetFinancialData(startOfCurrentMonth, todayDate);

        // 3. Execute tools if needed
        const requiredTools = detectRequiredTools(userMessage);
        const toolResults: ToolResult[] = [];

        // Financial tool
        if (requiredTools.includes('financial')) {
            // If the user explicitly asks about specific timeframes, parse them
            // Default to "Current Month" (1st to now) for accurate Net Profit calculation
            const dateRange = parseDateRange(userMessage) || {
                startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
                endDate: format(new Date(), 'yyyy-MM-dd')
            };

            // Fetch Previous Month for comparison if needed
            // For now, let's just get the current range robustly
            toolResults.push({
                name: 'Financial Data',
                result: await toolGetFinancialData(dateRange.startDate, dateRange.endDate)
            });
        }

        // Receivables tool
        if (requiredTools.includes('receivables')) {
            toolResults.push({
                name: 'Pending Receivables',
                result: await toolGetPendingReceivables()
            });
        }

        // Payables tool
        if (requiredTools.includes('payables')) {
            toolResults.push({
                name: 'Pending Payables',
                result: await toolGetPendingPayables()
            });
        }

        // Goals tool
        if (requiredTools.includes('goals')) {
            toolResults.push({
                name: 'Goal Progress',
                result: await toolGetGoalProgress()
            });
        }

        // Goal creation tool - Now returns pending action for confirmation
        let pendingAction: PendingAction | undefined;

        if (requiredTools.includes('create_goal')) {
            const parsed = parseGoalFromMessage(userMessage);
            if (parsed) {
                // Create a pending action instead of executing immediately
                pendingAction = {
                    id: `goal-${Date.now()}`,
                    type: 'create_goal',
                    description: `Create goal "${parsed.title}" with target ₹${parsed.target.toLocaleString()}${parsed.deadline ? ` by ${parsed.deadline}` : ''}${parsed.isRecurring ? ` (${parsed.recurrenceType})` : ''}`,
                    data: {
                        title: parsed.title,
                        targetAmount: parsed.target,
                        deadline: parsed.deadline,
                        metricType: 'net_profit',
                        isRecurring: parsed.isRecurring,
                        recurrenceType: parsed.recurrenceType
                    }
                };

                toolResults.push({
                    name: 'Goal Creation (Pending Confirmation)',
                    result: `I understood you want to create a goal:\n\n📌 **${parsed.title}**\n💰 Target: ₹${parsed.target.toLocaleString()}\n📅 Deadline: ${parsed.deadline || 'None'}\n🔁 Recurring: ${parsed.isRecurring ? parsed.recurrenceType : 'No'}\n\n⚠️ This action requires your confirmation.`
                });
            } else {
                toolResults.push({
                    name: 'Goal Creation Failed',
                    result: "I tried to create a goal but couldn't find a clear Target Amount (e.g. '50k', '10000') or Title. Please ask the user to specify the amount."
                });
            }
        }

        // Goal completion tool
        if (requiredTools.includes('complete_goal')) {
            // Extract goal name from message - improved patterns
            let goalName = '';

            // Try multiple patterns
            const patterns = [
                /(?:complete|mark|finish)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:goal|as complete)/i,
                /(?:complete|mark|finish)\s+goal\s*[:\-]?\s*(.+?)(?:\.|$)/i,
                /(?:complete|mark|finish)\s+(.+?)(?:\s+goal)?$/i
            ];

            for (const pattern of patterns) {
                const match = userMessage.match(pattern);
                if (match && match[1]) {
                    goalName = match[1].trim();
                    break;
                }
            }

            if (goalName) {
                const result = await toolCompleteGoal(goalName);
                toolResults.push({ name: 'Goal Completion', result });

                // Refresh goals list
                if (typeof window !== 'undefined') window.dispatchEvent(new Event('goal-updated'));
            }
        }

        // Goal deletion tool
        if (requiredTools.includes('delete_goal')) {
            let goalName = '';

            // Try multiple patterns
            const patterns = [
                /(?:delete|remove|cancel)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+goal/i,
                /(?:delete|remove|cancel)\s+goal\s*[:\-]?\s*(.+?)(?:\.|$)/i,
                /(?:delete|remove|cancel)\s+(.+?)(?:\s+goal)?$/i
            ];

            for (const pattern of patterns) {
                const match = userMessage.match(pattern);
                if (match && match[1]) {
                    goalName = match[1].trim();
                    break;
                }
            }

            if (goalName) {
                const result = await toolDeleteGoal(goalName);
                toolResults.push({ name: 'Goal Deletion', result });

                // Refresh goals list
                if (typeof window !== 'undefined') window.dispatchEvent(new Event('goal-updated'));
            }
        }

        // Goal update tool
        if (requiredTools.includes('update_goal')) {
            let goalName = '';

            // Try patterns for goal name
            const patterns = [
                /(?:update|change|modify|edit|add\s+to|increase)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+goal/i,
                /(?:goal\s+of|goal\s+for)\s+(.+?)(?:\s+target|\s+amount|\s*$)/i,
                /(?:update|change)\s+(.+?)(?:\s+goal)?$/i
            ];

            for (const pattern of patterns) {
                const match = userMessage.match(pattern);
                if (match && match[1]) {
                    goalName = match[1].trim();
                    break;
                }
            }

            // If still no goal name, try "Add 500 to savings" -> "savings"
            if (!goalName) {
                const simpleMatch = userMessage.match(/to\s+(?:my\s+)?(.+?)(?:\s+goal|\s*$)/i);
                if (simpleMatch) goalName = simpleMatch[1].trim();
            }

            if (goalName) {
                const updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly'; currentAmount?: number; addAmount?: number } = {};

                // Parse amount update if present
                const amountMatch = userMessage.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|L)?/);
                if (amountMatch) {
                    let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                    if (userMessage.toLowerCase().includes('k')) amount *= 1000;
                    if (userMessage.toLowerCase().includes('lakh')) amount *= 100000;

                    const lower = userMessage.toLowerCase();

                    // Determine what this amount is for
                    if (lower.includes('target') || lower.includes('total') || lower.includes('goal amount')) {
                        updates.targetAmount = amount;
                    } else if (lower.includes('add') || lower.includes('increase') || lower.includes('plus') || lower.includes('saved') || lower.includes('deposit')) {
                        // "Add 500", "Saved 500"
                        updates.addAmount = amount;
                    } else if (lower.includes('progress') || lower.includes('current') || lower.includes('reached') || lower.includes('set to') || lower.includes('now at')) {
                        // "Progress is 500", "Reached 5000"
                        updates.currentAmount = amount;
                    } else {
                        // Fallback: If amount is large (>100) and no other context, assume target. 
                        // If it's small, maybe it's an addition? Hard to say. 
                        // Let's assume target update for now to be safe, unless it says "add".
                        if (amount > 100) updates.targetAmount = amount;
                    }
                }

                // Check for recurrence updates
                const lowerMsg = userMessage.toLowerCase();
                if (lowerMsg.includes('monthly') || lowerMsg.includes('every month')) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'monthly';
                } else if (lowerMsg.includes('weekly') || lowerMsg.includes('every week')) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'weekly';
                } else if (lowerMsg.includes('not recurring') || lowerMsg.includes('stop recurring') || lowerMsg.includes('one time')) {
                    updates.isRecurring = false;
                }

                const result = await toolUpdateGoalProgress(goalName, updates);
                toolResults.push({ name: 'Goal Update', result });
            }
        }

        // Memory save tool - Now returns pending action for confirmation
        if (requiredTools.includes('save_memory') && !pendingAction) {
            // Extract what to remember
            let content = userMessage
                .replace(/remember\s*(that)?:?\s*/i, '')
                .replace(/save\s*(this)?:?\s*/i, '')
                .replace(/note\s*(that)?:?\s*/i, '')
                .trim();

            // Detect bucket type
            let bucket: 'preference' | 'fact' | 'context' = 'fact';
            if (userMessage.toLowerCase().includes('prefer') || userMessage.toLowerCase().includes('always') || userMessage.toLowerCase().includes('never')) {
                bucket = 'preference';
            } else if (userMessage.toLowerCase().includes('my name')) {
                bucket = 'fact';
            }

            if (content.length > 5) {
                // Create pending action instead of executing immediately
                pendingAction = {
                    id: `memory-${Date.now()}`,
                    type: 'save_memory',
                    description: `Save ${bucket}: "${content}"`,
                    data: { content, bucket }
                };

                toolResults.push({
                    name: 'Memory Save (Pending Confirmation)',
                    result: `I understood you want me to remember:\n\n📝 **Type:** ${bucket}\n💬 **Content:** "${content}"\n\n⚠️ This action requires your confirmation.`
                });
            }
        }

        // Memory deletion tool
        if (requiredTools.includes('delete_memory')) {
            const match = userMessage.match(/(?:forget|delete|remove).*?(?:about|memory|fact)?\s*[:\-]?\s*[\"']?([^\"']+)[\"']?/i);
            if (match) {
                const result = await toolDeleteMemory(match[1].trim());
                toolResults.push({ name: 'Memory Deleted', result });
            }
        }

        // Memory update tool
        if (requiredTools.includes('update_memory')) {
            const match = userMessage.match(/(?:update|change|modify).*?(?:memory|fact)?\s*[:\-]?\s*[\"']?([^\"']+)[\"']?\s*(?:to|with)\s*[\"']?([^\"']+)[\"']?/i);
            if (match) {
                const result = await toolUpdateMemoryContent(match[1].trim(), match[2].trim());
                toolResults.push({ name: 'Memory Updated', result });
            }
        }

        // List memories tool
        if (requiredTools.includes('list_memories')) {
            const memoryList = memories.length > 0
                ? memories.map((m, i) => `${i + 1}. [${m.bucket}] ${m.content}`).join('\n')
                : 'I don\'t have any saved memories about you yet.';
            toolResults.push({ name: 'Your Memories', result: memoryList });
        }

        // 4. Build tool results context
        const toolContext = toolResults.length > 0
            ? `\n\n--- LIVE DATA FROM TOOLS ---\n${toolResults.map(t => `[${t.name}]\n${t.result}`).join('\n\n')}`
            : '';

        // 5. Build system prompt
        const systemPrompt = `You are ${botName}, an intelligent and caring personal business assistant.
${userName ? `Your owner's name is ${userName}. Address them warmly.` : ''}

⚠️ **CRITICAL: DO NOT HALLUCINATE** ⚠️
You are FORBIDDEN from making up numbers or data. Every financial figure you mention MUST come from the LIVE DATA sections below. If you don't have data, say "I don't have that information" - NEVER guess or invent numbers.

YOUR PERSONALITY:
- You are supportive, motivating, and proactive
- You celebrate wins and encourage during challenges
- You speak like a trusted business partner
- Use emojis sparingly but effectively
- Be direct and actionable, not verbose

WHAT YOU KNOW ABOUT THE USER (from saved memories):
${memoriesText}

ACTIVE GOALS BEING TRACKED:
${goalsText}

CURRENT MONTH SNAPSHOT (Default Context):
${currentMonthContext}

${toolContext}

CRITICAL RULES:
1. **NEVER INVENT DATA**. Only use numbers from "LIVE DATA" sections. If unsure, say "I don't have that data."

2. Financial queries: Quote exact figures from LIVE DATA. Example: "NET PROFIT this month: ₹X (from data above)"

3. **Goal Creation**: When user wants a goal, ASK questions first:
   • "Goal name?"
   • "Target amount?"  
   • "Deadline? (optional)"
   • "Recurring? (optional)"
   Then create with their input.

4. **Goal Management**: Confirm before: updating, completing, deleting goals.

5. **Memories**: 
   • Max 30 - inform if at limit
   • Ask "Remember this?" before saving
   • Only mention facts from "WHAT YOU KNOW" section

6. **Completed Goals**: Don't mention unless asked. Focus on active goals only.

7. When asked "what are my goals" or "what do you know": Read EXACTLY from sections above.

8. Use ₹ for amounts. Be motivating and supportive.`;

        // 6. Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage }
        ];

        // Log prompt length for debugging
        const totalPromptLength = systemPrompt.length + history.reduce((sum, msg) => sum + msg.content.length, 0) + userMessage.length;
        console.log(`[AI] Total prompt length: ~${totalPromptLength} characters`);

        // 7. Call Mistral API
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: 'mistral-large-latest',
                messages: messages,
                temperature: 0.5,
                max_tokens: 800,
            })
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No error details');
            console.warn('[Mistral] API error:', response.status, errorBody);

            if (response.status === 401) return { text: "Invalid API Key. Please check settings.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            if (response.status === 429) return { text: "Rate limit exceeded. Please try again later.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            if (response.status === 503) return { text: "The AI service is temporarily unavailable or the request is too complex. Please try a shorter question or try again in a moment.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            return { text: `AI Error (${response.status}). Please try again.`, usage: { used: 0, limit: 0, resetInSeconds: null } };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "I couldn't process that.";
        const usedTokens = data.usage?.total_tokens || 0;

        return {
            text,
            usage: {
                used: usedTokens,
                limit: 1000000,
                resetInSeconds: null
            },
            pendingAction
        };

    } catch (error) {
        console.error('[Enhanced AI Chat] Error:', error);
        return { text: "Network error. Please check your connection.", usage: { used: 0, limit: 0, resetInSeconds: null } };
    }
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
        'emi_status': "What's my EMI status? Do I have enough to pay?"
    };

    const userPrompt = prompts[queryType] || "Tell me about my business status.";
    return enhancedChatWithAI(userPrompt, []);
}
