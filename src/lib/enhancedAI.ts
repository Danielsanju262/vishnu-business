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
        // Sales data
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, buy_price, quantity, date, products(name), customers(name)')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(50);

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
            return 'No active goals set. Would you like to set a new goal?';
        }

        const goalLines = waterfallGoals.map(g => {
            const statusEmoji = g.isFullyFunded ? '✅' : g.daysLeft < 3 ? '🔥' : '📈';
            return `${statusEmoji} ${g.goal.title}
   - Funds Allocated: ₹${g.allocatedAmount.toLocaleString()} / Target: ₹${g.goal.target_amount.toLocaleString()}
   - Remaining Needed: ₹${g.remainingNeeded.toLocaleString()}
   - Status: ${g.statusMessage}`;
        });

        return `ACTIVE GOALS (Waterfall Priority):\n\n${goalLines.join('\n\n')}`;
    } catch (error) {
        console.error('[AI Tool] Goals error:', error);
        return 'Error fetching goals.';
    }
}

// Tool: Save a Memory/Fact
async function toolSaveMemory(content: string, bucket: 'preference' | 'fact' | 'context' = 'fact'): Promise<string> {
    try {
        const memory = await addMemory(bucket, content);
        if (memory) {
            return `✅ Saved to memory: "${content}"`;
        }
        return '❌ Failed to save memory.';
    } catch (error) {
        console.error('[AI Tool] Save memory error:', error);
        return 'Error saving memory.';
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
            // Dispatch event to refresh dashboard
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }
            return `✅ Created goal: "${title}" with target ₹${targetAmount.toLocaleString()}${deadline ? ` by ${deadline}` : ''}${recurrenceText}`;
        }
        return '❌ Failed to create goal.';
    } catch (error) {
        console.error('[AI Tool] Create goal error:', error);
        return 'Error creating goal.';
    }
}

// Tool: Update Goal Progress or Details
async function toolUpdateGoalProgress(searchTitle: string, updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly' }): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            const updateData: any = {};
            if (updates.targetAmount) updateData.target_amount = updates.targetAmount;
            if (updates.deadline) updateData.deadline = updates.deadline;
            if (updates.isRecurring !== undefined) updateData.is_recurring = updates.isRecurring;
            if (updates.recurrenceType) updateData.recurrence_type = updates.recurrenceType;

            await updateGoal(match.id, updateData);

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }
            return `✅ Updated goal "${match.title}"`;
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
    if (lowerQuery.match(/update\s*(my\s*)?goal|change\s*(my\s*)?goal|modify\s*(my\s*)?goal|edit\s*(my\s*)?goal/i)) {
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

interface AIResponse {
    text: string;
    usage: {
        used: number;
        limit: number;
        resetInSeconds: number | null;
    };
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
            ? waterfallGoals.map(g => `- ${g.goal.title}: Needs ₹${g.remainingNeeded.toLocaleString()} more. ${g.statusMessage}`).join('\n')
            : 'No active goals.';

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

        // Goal creation tool
        if (requiredTools.includes('create_goal')) {
            const parsed = parseGoalFromMessage(userMessage);
            if (parsed) {
                const result = await toolCreateGoal(parsed.title, parsed.target, parsed.deadline, 'net_profit', parsed.isRecurring, parsed.recurrenceType);

                // Dispatch event explicitly here as well, just to be safe
                if (typeof window !== 'undefined') window.dispatchEvent(new Event('goal-updated'));

                toolResults.push({ name: 'Goal Creation', result });
            } else {
                toolResults.push({
                    name: 'Goal Creation Failed',
                    result: "I tried to create a goal but couldn't find a clear Target Amount (e.g. '50k', '10000') or Title. Please ask the user to specify the amount."
                });
            }
        }

        // Goal completion tool
        if (requiredTools.includes('complete_goal')) {
            // Extract goal name from message
            const goalMatch = userMessage.match(/(?:complete|mark|finish).*?(?:goal|target)?\s*[:\-]?\s*[\"']?([^\"']+)[\"']?/i);
            if (goalMatch) {
                const result = await toolCompleteGoal(goalMatch[1].trim());
                toolResults.push({ name: 'Goal Completion', result });
            }
        }

        // Goal deletion tool
        if (requiredTools.includes('delete_goal')) {
            const goalMatch = userMessage.match(/(?:delete|remove|cancel).*?goal\s*[:\-]?\s*[\"']?([^\"']+)[\"']?/i);
            if (goalMatch) {
                const result = await toolDeleteGoal(goalMatch[1].trim());
                toolResults.push({ name: 'Goal Deletion', result });
            }
        }

        // Goal update tool
        if (requiredTools.includes('update_goal')) {
            const updateMatch = userMessage.match(/(?:update|change|modify|edit).*?goal\s*[:\-]?\s*[\"']?([^\"']+)[\"']?/i);
            if (updateMatch) {
                const updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly' } = {};

                // Parse amount update if present (simple heuristic)
                const amountMatch = userMessage.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|L)?/);
                if (amountMatch) {
                    let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                    if (userMessage.toLowerCase().includes('k')) amount *= 1000;
                    if (userMessage.toLowerCase().includes('lakh')) amount *= 100000;
                    // Only apply if it seems reasonable (e.g. > 100) and user likely meant new target
                    if (amount > 100) updates.targetAmount = amount;
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

                const result = await toolUpdateGoalProgress(updateMatch[1].trim(), updates);
                toolResults.push({ name: 'Goal Update', result });
            }
        }

        // Memory save tool
        if (requiredTools.includes('save_memory')) {
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
                const result = await toolSaveMemory(content, bucket);
                toolResults.push({ name: 'Memory Saved', result });
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

YOUR PERSONALITY:
- You are supportive, motivating, and proactive
- You celebrate wins and encourage during challenges
- You speak like a trusted business partner
- Use emojis sparingly but effectively
- Be direct and actionable, not verbose

WHAT YOU KNOW ABOUT THE USER:
${memoriesText}

ACTIVE GOALS BEING TRACKED:
${goalsText}

CURRENT MONTH SNAPSHOT (Default Context):
${currentMonthContext}

${toolContext}

IMPORTANT INSTRUCTIONS:
1. If asked about data (sales, profits, etc.), use the LIVE DATA above
2. If no data is available for a specific time period, say so honestly
3. For goals like EMI payments, calculate: Current Progress vs Target, Days Remaining, and give motivational advice
4. Always confirm before assuming something new about the user
5. When the user shares personal info (name, preferences, EMIs), acknowledge and remember it
6. Be proactive: If you notice a concerning trend in the data, mention it
7. Use the Indian Rupee format (₹) for all amounts
8. When user asks to create, update, or delete goals/memories, the action has been executed - just confirm and explain
9. Waterfall Goal Logic: YOU MUST FOLLOW THIS. The 'ACTIVE GOALS' list above shows exactly how much is needed for each goal based on priority.
   - Use the calculated "Daily Run Rate" to motivate the user (e.g., "You need ₹2k/day for the next 3 days").
   - If a goal is fully funded in the waterfall, celebrate it! "You have already saved enough for X, now let's focus on Y."
   - Recurring Goals: If a recurring goal (like EMI) is fully funded and there is still money left (surplus), ASK the user: "You've finished this month's EMI! Do you want to start allocating this surplus to NEXT month's EMI now?"
   - Persistent Tracking: UNTIL the user explicitly says "I have completed this goal" or marks it done, YOU MUST keep reminding them.
   - Every Interaction: If there are active goals, always check their status. If the user opens the chat, ask: "How is progress on [Goal Name]? Any updates to add?"
10. MEMORY: You do not rely on old chat logs. If the user tells you a new fact (name, specific preference, new goal context), USE the 'save_memory' tool immediately.`;

        // 6. Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage }
        ];

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
            console.warn('[Mistral] API error:', response.status);
            if (response.status === 401) return { text: "Invalid API Key. Please check settings.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            if (response.status === 429) return { text: "Rate limit exceeded. Please try again later.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            return { text: `AI Error (${response.status}). Please try again.`, usage: { used: 0, limit: 0, resetInSeconds: null } };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "I couldn't process that.";
        const usedTokens = data.usage?.total_tokens || 0;

        // 8. Check if AI wants to save memory (post-processing)
        if (requiredTools.includes('save_memory') && text.includes('remember') && text.includes('✅')) {
            // Memory was saved during tool execution
        }

        return {
            text,
            usage: {
                used: usedTokens,
                limit: 1000000,
                resetInSeconds: null
            }
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
