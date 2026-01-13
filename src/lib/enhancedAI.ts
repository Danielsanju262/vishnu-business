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
    calculateWaterfallGoals,
    calculateAvailableSurplus,
    allocateToGoal,
    completeGoalWithTimestamp
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

// Tool: Delete a Memory by ID or content match
async function toolDeleteMemoryById(memoryId: string): Promise<string> {
    try {
        console.log('[AI Tool] Deleting memory by ID:', memoryId);
        await deleteMemory(memoryId);
        return `✅ Memory deleted successfully!`;
    } catch (error) {
        console.error('[AI Tool] Delete memory by ID error:', error);
        return `❌ Error deleting memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

async function toolDeleteMemory(searchText: string): Promise<string> {
    try {
        console.log('[AI Tool] Deleting memory by search:', searchText);
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

// Tool: Update a Memory by ID (for confirmed actions)
async function toolUpdateMemoryById(memoryId: string, newContent: string): Promise<string> {
    try {
        console.log('[AI Tool] Updating memory by ID:', memoryId, 'to:', newContent);
        await updateMemory(memoryId, newContent);
        return `✅ Memory updated successfully to: "${newContent}"`;
    } catch (error) {
        console.error('[AI Tool] Update memory by ID error:', error);
        return `❌ Error updating memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

async function toolUpdateMemoryContent(searchText: string, newContent: string): Promise<string> {
    try {
        console.log('[AI Tool] Updating memory by search:', searchText);
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
    recurrenceType?: 'monthly' | 'weekly' | 'yearly',
    startTrackingDate?: string
): Promise<string> {
    try {
        console.log('[AI Tool] Creating goal:', { title, targetAmount, deadline, metricType, isRecurring, recurrenceType, startTrackingDate });

        // Auto-detect if this is an EMI/payment goal
        const titleLower = title.toLowerCase();
        const isEMIGoal = titleLower.includes('emi') || titleLower.includes('payment') ||
            titleLower.includes('bill') || titleLower.includes('loan') ||
            titleLower.includes('rent') || titleLower.includes('installment');

        // For EM goals, set to manual_check and emi type
        const finalMetricType = isEMIGoal ? 'manual_check' : metricType;
        const goalType = isEMIGoal ? 'emi' : 'auto';

        const goal = await addGoal({
            title,
            target_amount: targetAmount,
            deadline: deadline,
            metric_type: finalMetricType,
            start_tracking_date: startTrackingDate || new Date().toISOString(),
            is_recurring: isRecurring,
            recurrence_type: recurrenceType,
            goal_type: goalType,
            allocated_amount: 0,
            reminder_enabled: true
        });

        const recurrenceText = isRecurring ? ` (${recurrenceType})` : '';
        if (goal) {
            console.log('[AI Tool] Goal created successfully:', goal);
            // Dispatch event to refresh dashboard
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }

            let response = `✅ Goal created successfully!\n- Title: "${title}"\n- Target: ₹${targetAmount.toLocaleString()}\n- Deadline: ${deadline || 'No deadline'}\n- Type: ${isEMIGoal ? '💳 EMI/Payment (Manual Allocation)' : '🎯 Auto-Tracked'}${recurrenceText}`;

            if (isEMIGoal) {
                response += `\n\n💡 This is an EMI goal. You can:\n• Allocate funds: "Allocate ₹X to ${title}"\n• Check surplus: "What's my surplus?"\n• Set tracking date: "Track from [date]"`;
            }

            return response;
        }
        console.error('[AI Tool] Goal creation returned null - check database connection and schema');
        return '❌ Failed to create goal. The goal data was valid, but the database operation failed. Please check that the user_goals table has all required columns.';
    } catch (error) {
        console.error('[AI Tool] Create goal error:', error);
        return `❌ Error creating goal: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

// Tool: Update Goal Progress or Details
async function toolUpdateGoalProgress(searchTitle: string, updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly'; currentAmount?: number; addAmount?: number; startDate?: string; newTitle?: string }): Promise<string> {
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
            if (updates.startDate) {
                updateData.start_tracking_date = updates.startDate;
                message += ` Start Date: ${updates.startDate}.`;
            }
            if (updates.newTitle) {
                updateData.title = updates.newTitle;
                message += ` Renamed to: "${updates.newTitle}".`;
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
                const success = await updateGoal(match.id, updateData);
                if (success) {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new Event('goal-updated'));
                    }
                    return `✅ Updated goal "${match.title}":${message}`;
                } else {
                    return `❌ Failed to update goal "${match.title}" in the database. Please try again.`;
                }
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

// Tool: Delete/Archive a Goal
async function toolDeleteGoal(searchTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            const success = await deleteGoal(match.id);
            if (success) {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('goal-updated'));
                }
                return `✅ Deleted goal: "${match.title}"`;
            } else {
                return `❌ Failed to delete goal "${match.title}" in the database.`;
            }
        }
        return `❌ No goal found matching "${searchTitle}"`;
    } catch (error) {
        console.error('[AI Tool] Delete goal error:', error);
        return 'Error deleting goal.';
    }
}

// Tool: Get Available Surplus (net profit minus completed EMIs)
async function toolGetSurplus(): Promise<string> {
    try {
        const { netProfitThisMonth, completedEMIsTotal, availableSurplus } = await calculateAvailableSurplus();
        const goals = await getActiveGoals();
        const pendingEMIs = goals.filter(g => g.goal_type === 'emi' || g.metric_type === 'manual_check');

        let output = ``;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `💰 **SURPLUS CALCULATION**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        output += `📈 Net Profit (This Month): ₹${netProfitThisMonth.toLocaleString()}\n`;
        output += `✅ Completed EMIs/Payments: - ₹${completedEMIsTotal.toLocaleString()}\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `💵 **Available Surplus: ₹${availableSurplus.toLocaleString()}**\n\n`;

        if (pendingEMIs.length > 0) {
            output += `📋 **Pending EMIs (${pendingEMIs.length}):**\n`;
            for (const emi of pendingEMIs) {
                const remaining = Math.max(0, emi.target_amount - emi.current_amount);
                output += `   • ${emi.title}: ₹${remaining.toLocaleString()} remaining\n`;
            }
            output += `\n`;
        }

        output += `💡 **Use Your Surplus:**\n`;
        output += `   • "Allocate ₹X to [goal]"\n`;
        output += `   • "Use surplus for [goal]"`;

        return output;
    } catch (error) {
        console.error('[AI Tool] Get surplus error:', error);
        return 'Error calculating surplus.';
    }
}

// Tool: Allocate funds to a goal
async function toolAllocateToGoalFunds(
    goalTitle: string,
    amount: number,
    source: 'surplus' | 'daily_profit' | 'manual' = 'manual'
): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(goalTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${goalTitle}"`;
        }

        // Check if amount is valid
        if (amount <= 0) {
            return `❌ Amount must be greater than 0`;
        }

        // Allocate to goal
        const success = await allocateToGoal(match.id, amount, source);

        if (!success) {
            return `❌ Failed to allocate funds to "${match.title}"`;
        }

        const newTotal = (match.current_amount || 0) + amount;
        const progress = Math.min(100, (newTotal / match.target_amount) * 100);
        const remaining = Math.max(0, match.target_amount - newTotal);
        const progressBar = generateProgressBar(progress);

        let message = ``;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `✅ **ALLOCATION SUCCESSFUL**\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        message += `📌 Goal: **${match.title}**\n`;
        message += `💵 Allocated: + ₹${amount.toLocaleString()}\n\n`;

        message += `📊 **Updated Progress:**\n`;
        message += `   ${progressBar} ${progress.toFixed(0)}%\n`;
        message += `   ₹${newTotal.toLocaleString()} / ₹${match.target_amount.toLocaleString()}\n\n`;

        if (remaining <= 0) {
            message += `🎉 **Goal is now 100% funded!**\n`;
            message += `💡 Say "Mark ${match.title} complete" when paid`;
        } else {
            message += `💪 Remaining: ₹${remaining.toLocaleString()}`;
        }

        return message;
    } catch (error) {
        console.error('[AI Tool] Allocate to goal error:', error);
        return 'Error allocating funds to goal.';
    }
}

// Tool: List all goals with comprehensive status
async function toolListAllGoals(): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const { availableSurplus, netProfitThisMonth, completedEMIsTotal } = await calculateAvailableSurplus();

        if (goals.length === 0) {
            return `📋 **No Active Goals**\n\nYou haven't set any goals yet.\n\n💡 **Get Started:**\n• "Set a goal for EMI of 15000 by 20th"\n• "Track 50k profit this month"`;
        }

        // Separate EMI and auto-tracked goals
        const emiGoals = goals.filter(g => g.metric_type === 'manual_check' || g.goal_type === 'emi');
        const autoGoals = goals.filter(g => g.metric_type !== 'manual_check' && g.goal_type !== 'emi');

        let output = ``;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `📊 **GOALS SUMMARY**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Financial Overview
        output += `💰 **Financial Overview:**\n`;
        output += `├─ Net Profit (This Month): ₹${netProfitThisMonth.toLocaleString()}\n`;
        output += `├─ Completed EMIs: ₹${completedEMIsTotal.toLocaleString()}\n`;
        output += `└─ Available Surplus: **₹${availableSurplus.toLocaleString()}**\n\n`;

        // EMI Goals Section
        if (emiGoals.length > 0) {
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `💳 **EMI / PAYMENT GOALS** (${emiGoals.length})\n`;
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            for (const goal of emiGoals) {
                const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                const remaining = Math.max(0, goal.target_amount - goal.current_amount);
                const progressBar = generateProgressBar(progress);

                let daysText = '';
                let urgency = '';
                if (goal.deadline) {
                    const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    if (daysLeft < 0) {
                        daysText = `⚠️ OVERDUE by ${Math.abs(daysLeft)} days`;
                        urgency = '🔴';
                    } else if (daysLeft === 0) {
                        daysText = `🔥 DUE TODAY!`;
                        urgency = '🔴';
                    } else if (daysLeft <= 3) {
                        daysText = `⚡ ${daysLeft} days left`;
                        urgency = '🟡';
                    } else {
                        daysText = `${daysLeft} days left`;
                        urgency = '🟢';
                    }
                }

                output += `${urgency} **${goal.title}**\n`;
                output += `   ${progressBar} ${progress.toFixed(0)}%\n`;
                output += `   ₹${goal.current_amount.toLocaleString()} / ₹${goal.target_amount.toLocaleString()}\n`;

                if (remaining > 0) {
                    output += `   Remaining: ₹${remaining.toLocaleString()}`;
                    if (daysText) {
                        output += ` · ${daysText}`;
                    }
                    output += `\n`;
                } else {
                    output += `   ✅ Fully Funded! Ready to complete.\n`;
                }
                output += `\n`;
            }
        }

        // Auto-Tracked Goals Section
        if (autoGoals.length > 0) {
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `🎯 **AUTO-TRACKED GOALS** (${autoGoals.length})\n`;
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            for (const goal of autoGoals) {
                const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                const remaining = Math.max(0, goal.target_amount - goal.current_amount);
                const progressBar = generateProgressBar(progress);

                let daysText = '';
                let dailyTarget = 0;
                if (goal.deadline) {
                    const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    daysText = daysLeft > 0 ? `${daysLeft} days left` : (daysLeft === 0 ? 'Due today!' : 'Overdue');
                    dailyTarget = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0;
                }

                const metricLabel = goal.metric_type === 'net_profit' ? '📈 Net Profit' :
                    goal.metric_type === 'revenue' ? '💵 Revenue' :
                        goal.metric_type === 'sales_count' ? '🛒 Sales Count' :
                            goal.metric_type === 'customer_count' ? '👥 Customers' :
                                goal.metric_type === 'gross_profit' ? '💰 Gross Profit' :
                                    goal.metric_type === 'margin' ? '📊 Margin %' :
                                        goal.metric_type === 'product_sales' ? '📦 Product Sales' : '🎯 Goal';

                output += `${metricLabel}: **${goal.title}**\n`;
                output += `   ${progressBar} ${progress.toFixed(0)}%\n`;
                output += `   ₹${goal.current_amount.toLocaleString()} / ₹${goal.target_amount.toLocaleString()}\n`;

                if (remaining > 0 && dailyTarget > 0) {
                    output += `   Need: ₹${dailyTarget.toLocaleString()}/day · ${daysText}\n`;
                } else if (remaining <= 0) {
                    output += `   🎉 Goal Achieved!\n`;
                }
                output += `\n`;
            }
        }

        // Actions Section
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `💡 **QUICK ACTIONS**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        output += `• "Allocate ₹X to [goal]" → Add funds\n`;
        output += `• "Add surplus to [goal]" → Use available surplus\n`;
        output += `• "Mark [goal] complete" → Complete a goal\n`;
        output += `• "What's my surplus?" → Check available money`;

        return output;
    } catch (error) {
        console.error('[AI Tool] List goals error:', error);
        return 'Error fetching goals.';
    }
}

// Helper: Generate visual progress bar
function generateProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}


// Tool: Mark goal as complete with timestamp
async function toolMarkGoalComplete(searchTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${searchTitle}"`;
        }

        const isEMIGoal = match.goal_type === 'emi' || match.metric_type === 'manual_check';

        const success = await completeGoalWithTimestamp(match.id);

        if (!success) {
            return `❌ Failed to complete goal "${match.title}"`;
        }

        let response = ``;
        response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        response += `🎉 **GOAL COMPLETED!**\n`;
        response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        response += `📌 Goal: **${match.title}**\n`;
        response += `💰 Amount: ₹${match.target_amount.toLocaleString()}\n`;
        response += `📅 Completed: ${new Date().toLocaleDateString()}\n\n`;
        response += `🏆 Great job! Keep it up!`;

        // PROACTIVE POST-COMPLETION FLOW
        if (isEMIGoal) {
            // Calculate new surplus after marking this EMI complete
            const { availableSurplus, netProfitThisMonth, completedEMIsTotal } = await calculateAvailableSurplus();

            // Find other active EMI goals
            const otherEMIs = goals.filter(g =>
                g.id !== match.id &&
                (g.goal_type === 'emi' || g.metric_type === 'manual_check')
            );

            if (availableSurplus > 0 && otherEMIs.length > 0) {
                response += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                response += `📊 **UPDATED FINANCES**\n`;
                response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                response += `├─ Net Profit: ₹${netProfitThisMonth.toLocaleString()}\n`;
                response += `├─ Completed EMIs: ₹${completedEMIsTotal.toLocaleString()}\n`;
                response += `└─ **Surplus: ₹${availableSurplus.toLocaleString()}**\n`;

                // Find the next EMI with earliest deadline
                const nextEMI = otherEMIs.sort((a, b) => {
                    if (!a.deadline) return 1;
                    if (!b.deadline) return -1;
                    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
                })[0];

                if (nextEMI) {
                    const remaining = nextEMI.target_amount - (nextEMI.current_amount || 0);
                    const daysLeft = nextEMI.deadline ? Math.ceil((new Date(nextEMI.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const progressBar = generateProgressBar(Math.min(100, ((nextEMI.current_amount || 0) / nextEMI.target_amount) * 100));

                    response += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    response += `🎯 **NEXT EMI: ${nextEMI.title}**\n`;
                    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    response += `   ${progressBar}\n`;
                    response += `   ₹${(nextEMI.current_amount || 0).toLocaleString()} / ₹${nextEMI.target_amount.toLocaleString()}\n`;
                    response += `   Remaining: ₹${remaining.toLocaleString()}`;
                    if (daysLeft !== null) {
                        response += ` · ${daysLeft} days left`;
                    }
                    response += `\n`;

                    response += `\n💡 **Quick Action:**\n`;
                    if (availableSurplus >= remaining) {
                        response += `   You can fully fund this goal!\n`;
                        response += `   → "Allocate ₹${remaining.toLocaleString()} to ${nextEMI.title}"`;
                    } else {
                        response += `   → "Use surplus for ${nextEMI.title}"`;
                    }
                }
            } else if (availableSurplus > 0) {
                response += `\n\n💰 **Surplus: ₹${availableSurplus.toLocaleString()}**\n`;
                response += `✨ No other EMI goals pending. Amazing work!`;
            }
        }

        return response;
    } catch (error) {
        console.error('[AI Tool] Complete goal error:', error);
        return 'Error completing goal.';
    }
}

// Tool: Set tracking date for a goal with surplus choice
async function toolSetTrackingDate(
    goalTitle: string,
    startDate: string,
    includeSurplus: boolean
): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(goalTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${goalTitle}"`;
        }

        // Update goal with tracking preferences
        await updateGoal(match.id, {
            allocation_start_date: startDate,
            include_surplus: includeSurplus
        });

        const { availableSurplus } = await calculateAvailableSurplus();

        let response = `✅ **Tracking configured for "${match.title}"**\n\n📅 Start Date: ${new Date(startDate).toLocaleDateString()}\n`;

        if (includeSurplus) {
            response += `💰 Including Previous Surplus: ₹${availableSurplus.toLocaleString()}\n`;
            response += `\n📊 I'll track:\n• Previous surplus: ₹${availableSurplus.toLocaleString()}\n• + Net profit from ${new Date(startDate).toLocaleDateString()} onwards`;
        } else {
            response += `🆕 Starting Fresh (₹0)\n`;
            response += `\n📊 I'll only count net profit from ${new Date(startDate).toLocaleDateString()} onwards`;
        }

        response += `\n\n💡 You can still add surplus later by saying "Add surplus to ${match.title}"`;

        return response;
    } catch (error) {
        console.error('[AI Tool] Set tracking date error:', error);
        return 'Error setting tracking date.';
    }
}

// Tool: Add surplus to a goal
async function toolAddSurplusToGoal(goalTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(goalTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${goalTitle}"`;
        }

        const { availableSurplus } = await calculateAvailableSurplus();

        if (availableSurplus <= 0) {
            return `📊 No surplus available to add.\n\nNet profit this month has already been allocated to completed EMIs.`;
        }

        // Allocate surplus to goal
        const success = await allocateToGoal(match.id, availableSurplus, 'surplus');

        if (!success) {
            return `❌ Failed to add surplus to "${match.title}"`;
        }

        const newTotal = (match.current_amount || 0) + availableSurplus;
        const progress = Math.min(100, (newTotal / match.target_amount) * 100);
        const remaining = Math.max(0, match.target_amount - newTotal);

        let response = `✅ **Added surplus to "${match.title}"**\n\n💰 Surplus Added: ₹${availableSurplus.toLocaleString()}\n\n📊 Updated Progress:\n- Total: ₹${newTotal.toLocaleString()} / ₹${match.target_amount.toLocaleString()} (${progress.toFixed(0)}%)`;

        if (remaining <= 0) {
            response += `\n\n🎉 Goal is now 100% funded! Ready to mark as complete?`;
        } else {
            response += `\n- Remaining: ₹${remaining.toLocaleString()}`;

            if (match.deadline) {
                const daysLeft = Math.ceil((new Date(match.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                if (daysLeft > 0) {
                    const dailyNeeded = Math.ceil(remaining / daysLeft);
                    response += `\n- Daily target: ₹${dailyNeeded.toLocaleString()}/day for ${daysLeft} days`;
                }
            }
        }

        return response;
    } catch (error) {
        console.error('[AI Tool] Add surplus error:', error);
        return 'Error adding surplus.';
    }
}

// Parse goal creation from natural language
// Helper to determine start date based on context
// TODO: Integrate this with goal creation confirmation dialog

function parseSmartDateRange(message: string): {
    startDate: string;
    suggestedStartDate?: string;
    shouldAsk: boolean;
    context: string
} {
    const today = new Date();
    const lowerMessage = message.toLowerCase();

    // Default: start from today
    let startDate = format(today, 'yyyy-MM-dd');
    let suggestedStartDate: string | undefined;
    let shouldAsk = false;
    let context = 'today';

    // Context-based detection
    if (lowerMessage.includes('this month')) {
        // If they say "this month", they might want data from start of month
        suggestedStartDate = format(startOfMonth(today), 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'this month';
    } else if (lowerMessage.includes('this week')) {
        // If they say "this week", they might want data from start of week
        const startOfWeek = subDays(today, today.getDay());
        suggestedStartDate = format(startOfWeek, 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'this week';
    } else if (lowerMessage.match(/month\s+end|by\s+month\s+end/)) {
        // "by month end" likely means from month start
        suggestedStartDate = format(startOfMonth(today), 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'month end';
    } else if (lowerMessage.includes('week end') || lowerMessage.includes('by weekend')) {
        // "by week end" likely means from week start
        const startOfWeek = subDays(today, today.getDay());
        suggestedStartDate = format(startOfWeek, 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'week end';
    }

    // If we have a suggested start date, use it as default if not asking
    if (suggestedStartDate && !shouldAsk) {
        startDate = suggestedStartDate;
    }

    return { startDate, suggestedStartDate, shouldAsk, context };
}


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

    // Goal allocation (EMI tracking)
    if (lowerQuery.match(/allocate|allot|assign.*to.*goal|fund.*goal|use.*surplus|add.*to.*emi|put.*towards/i)) {
        tools.push('allocate_goal');
    }

    // List all goals query
    if (lowerQuery.match(/list\s*(all\s*)?(my\s*)?goals|show\s*(all\s*)?(my\s*)?goals|what\s*are\s*my\s*goals|tell\s*me\s*about\s*my\s*goals/i)) {
        tools.push('list_goals');
    }

    // Surplus query
    if (lowerQuery.match(/surplus|available.*money|how\s*much\s*(can|do)\s*i\s*(have|allocate)|remaining.*profit/i)) {
        tools.push('get_surplus');
    }

    // Set tracking date for goal
    if (lowerQuery.match(/start\s+(tracking|counting|from)|track\s+from|begin\s+(tracking|from)|allocate\s+from/i)) {
        tools.push('set_tracking_date');
    }

    // Add surplus to goal
    if (lowerQuery.match(/add\s+(the\s+)?(previous\s+)?surplus|use\s+(the\s+)?surplus|include\s+surplus/i)) {
        tools.push('add_surplus');
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
    type: 'create_goal' | 'save_memory' | 'delete_goal' | 'delete_memory' | 'update_memory' | 'allocate_goal' | 'complete_goal' | 'set_tracking_date' | 'add_surplus' | 'update_goal';
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
                const { title, targetAmount, deadline, metricType, isRecurring, recurrenceType, suggestedDate, todayDate } = action.data;

                // If we have date choices, use the appropriate one
                // (Date choice would have been made in the confirmation)
                const startTrackingDate = suggestedDate || todayDate || undefined;

                const result = await toolCreateGoal(title, targetAmount, deadline, metricType, isRecurring, recurrenceType, startTrackingDate);
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
                const { memoryId, searchText } = action.data;
                console.log('[AI] Executing delete_memory:', { memoryId, searchText });
                // Use memoryId if available (from smart matching), otherwise fall back to search
                const result = memoryId
                    ? await toolDeleteMemoryById(memoryId)
                    : await toolDeleteMemory(searchText);
                return result;
            }
            case 'update_memory': {
                const { memoryId, searchText, newContent } = action.data;
                console.log('[AI] Executing update_memory:', { memoryId, searchText, newContent });
                // Use memoryId if available (from smart matching), otherwise fall back to search
                const result = memoryId
                    ? await toolUpdateMemoryById(memoryId, newContent)
                    : await toolUpdateMemoryContent(searchText, newContent);
                return result;
            }
            case 'allocate_goal': {
                const { goalId, goalTitle, amount, source } = action.data;
                console.log('[AI] Executing allocate_goal:', { goalId, goalTitle, amount, source });
                const result = await toolAllocateToGoalFunds(goalTitle, amount, source);
                return result;
            }
            case 'complete_goal': {
                const { goalTitle } = action.data;
                console.log('[AI] Executing complete_goal:', { goalTitle });
                const result = await toolMarkGoalComplete(goalTitle);
                return result;
            }
            case 'set_tracking_date': {
                const { goalTitle, startDate, includeSurplus } = action.data;
                console.log('[AI] Executing set_tracking_date:', { goalTitle, startDate, includeSurplus });
                const result = await toolSetTrackingDate(goalTitle, startDate, includeSurplus);
                return result;
            }
            case 'add_surplus': {
                const { goalTitle } = action.data;
                console.log('[AI] Executing add_surplus:', { goalTitle });
                const result = await toolAddSurplusToGoal(goalTitle);
                return result;
            }
            case 'update_goal': {
                const { goalTitle, updates } = action.data;
                console.log('[AI] Executing update_goal:', { goalTitle, updates });
                const result = await toolUpdateGoalProgress(goalTitle, updates);
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
                // Check if we need to ask about start date
                const dateInfo = parseSmartDateRange(userMessage);

                if (dateInfo.shouldAsk && dateInfo.suggestedStartDate) {
                    // Create a pending action that asks about date choice
                    const todayFormatted = format(new Date(), 'MMM d');
                    const suggestedFormatted = format(new Date(dateInfo.suggestedStartDate), 'MMM d');

                    pendingAction = {
                        id: `goal-date-${Date.now()}`,
                        type: 'create_goal',
                        description: `Create goal "${parsed.title}" - Choose start date`,
                        data: {
                            title: parsed.title,
                            targetAmount: parsed.target,
                            deadline: parsed.deadline,
                            metricType: 'net_profit',
                            isRecurring: parsed.isRecurring,
                            recurrenceType: parsed.recurrenceType,
                            todayDate: format(new Date(), 'yyyy-MM-dd'),
                            suggestedDate: dateInfo.suggestedStartDate,
                            context: dateInfo.context
                        }
                    };

                    toolResults.push({
                        name: 'Goal Creation - Date Choice Needed',
                        result: `I'll create a ${parsed.title} goal of ₹${parsed.target.toLocaleString()} for ${dateInfo.context}.

📅 **Choose tracking start date:**

**Option 1:** From ${suggestedFormatted} (${dateInfo.context} start)
  • Includes existing sales data
  • Shows full ${dateInfo.context} progress

**Option 2:** From ${todayFormatted} (today)
  • Fresh start from now
  • Only future sales count

💡 Which would you like? Reply with "1" or "2" or say "from ${dateInfo.context} start" or "from today"`
                    });
                } else {
                    // No date choice needed, create normal pending action
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
                }
            } else {
                toolResults.push({
                    name: 'Clarification Needed',
                    result: `🎯 **I'd love to help you set up a new goal!**\n\nI noticed you want to create a goal, but I need one more detail:\n\n❓ **What is your target amount for this goal?**\n\n_For example: "50,000" or "1 lakh"_`
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
                // Create pending action for confirmation
                pendingAction = {
                    id: `complete-goal-${Date.now()}`,
                    type: 'complete_goal',
                    description: `Mark goal "${goalName}" as complete`,
                    data: { goalTitle: goalName }
                };

                toolResults.push({
                    name: 'Goal Completion (Pending Confirmation)',
                    result: `I'll mark "${goalName}" as complete.\n\n⚠️ This action requires your confirmation.`
                });
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
                // Create pending action for confirmation
                pendingAction = {
                    id: `delete-goal-${Date.now()}`,
                    type: 'delete_goal',
                    description: `Delete goal "${goalName}"`,
                    data: { searchTitle: goalName }
                };

                toolResults.push({
                    name: 'Goal Deletion (Pending Confirmation)',
                    result: `I'll delete the goal "${goalName}".\n\n⚠️ This action requires your confirmation.`
                });
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
                const updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly'; currentAmount?: number; addAmount?: number; startDate?: string; newTitle?: string } = {};

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
                    } else if (amount > 100 && !lower.includes('date') && !lower.includes('start')) {
                        // Only assume target if it's not part of a date string
                        updates.targetAmount = amount;
                    }
                }

                const lowerMsg = userMessage.toLowerCase();

                // Check for recurrence updates
                if (lowerMsg.includes('monthly') || lowerMsg.includes('every month')) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'monthly';
                } else if (lowerMsg.includes('weekly') || lowerMsg.includes('every week')) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'weekly';
                } else if (lowerMsg.includes('not recurring') || lowerMsg.includes('stop recurring') || lowerMsg.includes('one time')) {
                    updates.isRecurring = false;
                }

                // Check for Start Date updates
                if (lowerMsg.includes('start') || lowerMsg.includes('begin')) {
                    const dateMatch = userMessage.match(/(?:from|to|on)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?(?:\s+[a-zA-Z]+)?)/i);
                    if (dateMatch) {
                        let dateStr = dateMatch[1];
                        // Simple date parsing for "1st", "2nd", etc to current month
                        if (dateStr.match(/^\d{1,2}(?:st|nd|rd|th)?$/)) {
                            const day = parseInt(dateStr);
                            const now = new Date();
                            dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        } else if (dateStr.match(/^\d{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]+$/)) {
                            // Date like "20th January"
                            const parts = dateStr.split(' ');
                            const day = parseInt(parts[0]);
                            const monthStr = parts[1].toLowerCase();
                            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                            const monthIndex = months.findIndex(m => monthStr.startsWith(m));
                            if (monthIndex >= 0) {
                                const now = new Date();
                                dateStr = `${now.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            }
                        }
                        updates.startDate = dateStr;
                    }
                }

                // Check for Title/Rename updates
                if (lowerMsg.includes('rename') || lowerMsg.includes('change title') || lowerMsg.includes('call it') || lowerMsg.includes('name it')) {
                    const titleMatch = userMessage.match(/(?:to|as|call it|name it)\s+["']?(.+?)["']?(?:\s|$)/i);
                    if (titleMatch) {
                        const potentialTitle = titleMatch[1].trim();
                        // Ensure we didn't capture overlapping keywords
                        if (!potentialTitle.toLowerCase().startsWith('start') && !potentialTitle.toLowerCase().startsWith('monthly')) {
                            updates.newTitle = potentialTitle;
                        }
                    }
                }

                if (Object.keys(updates).length > 0) {
                    // Create pending action for confirmation
                    pendingAction = {
                        id: `update-goal-${Date.now()}`,
                        type: 'update_goal',
                        description: `Update goal "${goalName}"`,
                        data: { goalTitle: goalName, updates }
                    };

                    let updatesSummary = '';
                    if (updates.targetAmount) updatesSummary += `\n• Target: ₹${updates.targetAmount.toLocaleString()}`;
                    if (updates.currentAmount) updatesSummary += `\n• Current: ₹${updates.currentAmount.toLocaleString()}`;
                    if (updates.addAmount) updatesSummary += `\n• Add: ₹${updates.addAmount.toLocaleString()}`;
                    if (updates.deadline) updatesSummary += `\n• Deadline: ${updates.deadline}`;
                    if (updates.startDate) updatesSummary += `\n• Start Date: ${updates.startDate}`;
                    if (updates.newTitle) updatesSummary += `\n• Rename to: "${updates.newTitle}"`;
                    if (updates.isRecurring !== undefined) updatesSummary += `\n• Recurring: ${updates.isRecurring ? updates.recurrenceType : 'No'}`;

                    toolResults.push({
                        name: 'Goal Update (Pending Confirmation)',
                        result: `I'll update the goal "${goalName}" with:${updatesSummary}\n\n⚠️ This action requires your confirmation.`
                    });
                } else {
                    toolResults.push({
                        name: 'Clarification Needed',
                        result: `📝 **Update Goal: ${goalName}**\n\nI found your goal! What would you like to change?\n\n• **Target** – Change the goal amount\n• **Deadline** – Adjust the due date\n• **Title** – Rename the goal\n• **Progress** – Update current progress\n\n❓ **Which one would you like to update?**`
                    });
                }
            } else {
                toolResults.push({
                    name: 'Clarification Needed',
                    result: `📝 **Update Goal**\n\nI'd be happy to help you update a goal!\n\n❓ **Which goal would you like to update?**\n\n_Just mention the goal name and what you'd like to change._`
                });
            }
        }

        // List all goals tool
        if (requiredTools.includes('list_goals')) {
            const result = await toolListAllGoals();
            toolResults.push({ name: 'Goals Summary', result });
        }

        // Get surplus tool
        if (requiredTools.includes('get_surplus')) {
            const result = await toolGetSurplus();
            toolResults.push({ name: 'Surplus Calculation', result });
        }

        // Goal allocation tool - Now returns pending action for confirmation
        if (requiredTools.includes('allocate_goal') && !pendingAction) {
            console.log('[AI Allocate] Triggered for message:', userMessage);

            // Parse allocation request: "Allocate 5000 to bike EMI" or "Use surplus for car loan"
            const amountMatch = userMessage.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|L)?/);
            let amount = 0;
            if (amountMatch) {
                amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                if (userMessage.toLowerCase().includes('k')) amount *= 1000;
                if (userMessage.toLowerCase().includes('lakh')) amount *= 100000;
            }

            // Find goal name from message
            const goals = await getActiveGoals();
            let matchedGoal = null;

            // Extract keywords and find matching goal
            const stopWords = ['allocate', 'allot', 'assign', 'put', 'use', 'add', 'to', 'towards', 'for', 'my', 'the', 'a', 'goal', 'emi', 'surplus'];
            const messageWords = userMessage.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\d+/g, '') // Remove numbers
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.includes(word));

            console.log('[AI Allocate] Search words:', messageWords);

            for (const goal of goals) {
                const goalTitle = goal.title.toLowerCase();
                for (const word of messageWords) {
                    if (goalTitle.includes(word)) {
                        matchedGoal = goal;
                        break;
                    }
                }
                if (matchedGoal) break;
            }

            // If no amount specified but we have surplus, use it
            if (amount === 0 && userMessage.toLowerCase().includes('surplus')) {
                const { availableSurplus } = await calculateAvailableSurplus();
                amount = availableSurplus;
            }

            if (matchedGoal && amount > 0) {
                const newTotal = (matchedGoal.current_amount || 0) + amount;
                const progress = Math.min(100, (newTotal / matchedGoal.target_amount) * 100);
                const remaining = Math.max(0, matchedGoal.target_amount - newTotal);

                pendingAction = {
                    id: `allocate-${Date.now()}`,
                    type: 'allocate_goal',
                    description: `Allocate ₹${amount.toLocaleString()} to "${matchedGoal.title}"`,
                    data: {
                        goalId: matchedGoal.id,
                        goalTitle: matchedGoal.title,
                        amount,
                        source: 'manual'
                    }
                };

                let message = `I'll allocate funds to your goal:\n\n💳 **Goal:** ${matchedGoal.title}\n💰 **Amount:** ₹${amount.toLocaleString()}\n\n📊 **After allocation:**\n- Progress: ₹${newTotal.toLocaleString()} / ₹${matchedGoal.target_amount.toLocaleString()} (${progress.toFixed(0)}%)`;

                if (remaining <= 0) {
                    message += `\n- 🎉 **Goal will be 100% funded!**`;
                } else {
                    message += `\n- Remaining: ₹${remaining.toLocaleString()}`;
                }

                message += `\n\n⚠️ This action requires your confirmation.`;

                toolResults.push({
                    name: 'Goal Allocation (Pending Confirmation)',
                    result: message
                });
            } else if (!matchedGoal && goals.length > 0) {
                const goalList = goals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Clarification Needed',
                    result: `💰 **Allocate Funds**\n\nI couldn't identify which goal you're referring to.\n\n**Your active goals:**\n${goalList}\n\n❓ **Which goal would you like to allocate funds to?**`
                });
            } else if (amount <= 0) {
                toolResults.push({
                    name: 'Amount Required',
                    result: `💰 **Amount Needed**\n\nPlease specify how much you'd like to allocate.\n\n**Examples:**\n• "Allocate 5000 to bike EMI"\n• "Use surplus for car loan"\n• "Put 10k towards savings goal"\n\n❓ **How much would you like to allocate?**`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `🎯 **No Active Goals**\n\nYou don't have any active goals yet!\n\nWould you like to create one?\n\n**Example:** "Set a goal for EMI of 15000 by 20th"`
                });
            }
        }

        // Set tracking date tool - Pending action with surplus choice
        if (requiredTools.includes('set_tracking_date') && !pendingAction) {
            console.log('[AI Set Tracking Date] Triggered for message:', userMessage);

            // Find goal name
            const goals = await getActiveGoals();
            let matchedGoal = null;

            // Extract keywords from message
            const stopWords = ['start', 'track', 'tracking', 'from', 'begin', 'allocate', 'counting', 'for', 'the', 'my', 'a', 'an'];
            const messageWords = userMessage.toLowerCase()
                .replace(/\d+/g, '') // Remove dates/numbers temporarily
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.includes(word));

            for (const goal of goals) {
                const goalTitle = goal.title.toLowerCase();
                for (const word of messageWords) {
                    if (goalTitle.includes(word)) {
                        matchedGoal = goal;
                        break;
                    }
                }
                if (matchedGoal) break;
            }

            // Extract date from message
            let startDate = '';
            const datePatterns = [
                /from\s+(\d{1,2})(?:st|nd|rd|th)?/i,
                /from\s+(\d{1,2})-(\d{1,2})-(\d{4})/i,
                /from\s+(\d{4})-(\d{1,2})-(\d{1,2})/i,
                /track\s+from\s+(\d{1,2})(?:st|nd|rd|th)?/i
            ];

            for (const pattern of datePatterns) {
                const match = userMessage.match(pattern);
                if (match) {
                    if (match.length === 2) {
                        // Just day number like "21st" - use current month/year
                        const day = match[1];
                        const now = new Date();
                        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    } else if (match.length === 4) {
                        // Full date
                        startDate = `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
                    }
                    break;
                }
            }

            if (matchedGoal && startDate) {
                const { availableSurplus } = await calculateAvailableSurplus();

                pendingAction = {
                    id: `track-date-${Date.now()}`,
                    type: 'set_tracking_date',
                    description: `Set tracking for "${matchedGoal.title}" from ${new Date(startDate).toLocaleDateString()}`,
                    data: {
                        goalTitle: matchedGoal.title,
                        startDate,
                        includeSurplus: false // Will be asked in confirmation
                    }
                };

                toolResults.push({
                    name: 'Tracking Date Configuration (Pending)',
                    result: `I'll configure tracking for "${matchedGoal.title}"\n\n📅 Start Date: ${new Date(startDate).toLocaleDateString()}\n💰 Available Surplus: ₹${availableSurplus.toLocaleString()}\n\n⚠️ Please confirm:\n\n**Would you like to:**\n1. 📦 Include previous surplus (₹${availableSurplus.toLocaleString()})\n2. 🆕 Start fresh from ₹0\n\n(The AI will ask you in the next message)`
                });
            } else if (!matchedGoal && goals.length > 0) {
                const goalList = goals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Goal Not Found',
                    result: `📅 **Set Tracking Date**\n\nI couldn't identify which goal you're referring to.\n\n**Your active goals:**\n${goalList}\n\n❓ **Which goal would you like to set tracking for?**`
                });
            } else if (!startDate) {
                toolResults.push({
                    name: 'Date Required',
                    result: `📅 **Start Date Needed**\n\nI need to know when to start tracking.\n\n**Examples:**\n• "Start tracking from 21st"\n• "Track my bike EMI from January 25th"\n• "Begin allocating from 2026-01-20"\n\n❓ **From which date should I start tracking?**`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `🎯 **No Active Goals**\n\nYou don't have any active goals yet!\n\nWould you like to create one?\n\n**Example:** "Set a goal for EMI of 15000 by 20th"`
                });
            }
        }

        // Add surplus tool - Pending action for confirmation
        if (requiredTools.includes('add_surplus') && !pendingAction) {
            console.log('[AI Add Surplus] Triggered for message:', userMessage);

            // Find goal name
            const goals = await getActiveGoals();
            let matchedGoal = null;

            // Extract keywords
            const stopWords = ['add', 'use', 'include', 'the', 'previous', 'surplus', 'to', 'for', 'my', 'a', 'an'];
            const messageWords = userMessage.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.includes(word));

            for (const goal of goals) {
                const goalTitle = goal.title.toLowerCase();
                for (const word of messageWords) {
                    if (goalTitle.includes(word)) {
                        matchedGoal = goal;
                        break;
                    }
                }
                if (matchedGoal) break;
            }

            if (matchedGoal) {
                const { availableSurplus } = await calculateAvailableSurplus();

                if (availableSurplus <= 0) {
                    toolResults.push({
                        name: 'No Surplus Available',
                        result: `📊 No surplus available to add.\n\nNet profit this month has already been allocated to completed EMIs.`
                    });
                } else {
                    const newTotal = (matchedGoal.current_amount || 0) + availableSurplus;
                    const progress = Math.min(100, (newTotal / matchedGoal.target_amount) * 100);
                    const remaining = Math.max(0, matchedGoal.target_amount - newTotal);

                    pendingAction = {
                        id: `add-surplus-${Date.now()}`,
                        type: 'add_surplus',
                        description: `Add surplus ₹${availableSurplus.toLocaleString()} to "${matchedGoal.title}"`,
                        data: {
                            goalTitle: matchedGoal.title
                        }
                    };

                    let message = `I'll add the available surplus to "${matchedGoal.title}"\n\n💰 Surplus: ₹${availableSurplus.toLocaleString()}\n\n📊 **After adding:**\n- Total: ₹${newTotal.toLocaleString()} / ₹${matchedGoal.target_amount.toLocaleString()} (${progress.toFixed(0)}%)`;

                    if (remaining <= 0) {
                        message += `\n- 🎉 **Goal will be 100% funded!**`;
                    } else {
                        message += `\n- Remaining: ₹${remaining.toLocaleString()}`;
                    }

                    message += `\n\n⚠️ This action requires your confirmation.`;

                    toolResults.push({
                        name: 'Add Surplus (Pending Confirmation)',
                        result: message
                    });
                }
            } else if (goals.length > 0) {
                const goalList = goals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Goal Not Found',
                    result: `I couldn't find which goal you want to add surplus to.\n\n**Your active goals:**\n${goalList}\n\nPlease specify the goal name.`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `You don't have any active goals yet. Create one first!`
                });
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

        // Memory deletion tool - Now requires confirmation with SMART MATCHING
        if (requiredTools.includes('delete_memory')) {
            console.log('[AI Delete Memory] Triggered for message:', userMessage);

            // Get all memories first
            const memories = await getActiveMemories();
            console.log('[AI Delete Memory] Found memories:', memories.length);

            if (memories.length === 0) {
                toolResults.push({
                    name: 'No Memories',
                    result: `You don't have any saved memories yet. Nothing to delete!`
                });
            } else {
                // Extract keywords from the user's message (remove common words)
                const stopWords = ['forget', 'delete', 'remove', 'about', 'my', 'the', 'a', 'an', 'that', 'this', 'preference', 'memory', 'fact', 'please', 'can', 'you', 'i', 'me', 'from', 'your', 'memories'];
                const messageWords = userMessage.toLowerCase()
                    .replace(/[^\w\s]/g, '') // Remove punctuation
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !stopWords.includes(word));

                console.log('[AI Delete Memory] Search keywords:', messageWords);

                // Find the best matching memory by counting keyword hits
                let bestMatch: { memory: typeof memories[0]; score: number } | null = null;

                for (const memory of memories) {
                    const memoryContent = memory.content.toLowerCase();
                    let score = 0;

                    for (const word of messageWords) {
                        if (memoryContent.includes(word)) {
                            score += 1;
                        }
                    }

                    console.log('[AI Delete Memory] Memory:', memory.content, 'Score:', score);

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { memory, score };
                    }
                }

                if (bestMatch) {
                    console.log('[AI Delete Memory] Best match found:', bestMatch.memory.content);

                    // Create pending action for confirmation
                    pendingAction = {
                        id: `delete-memory-${Date.now()}`,
                        type: 'delete_memory',
                        description: `Delete memory: "${bestMatch.memory.content}"`,
                        data: { memoryId: bestMatch.memory.id, searchText: bestMatch.memory.content }
                    };

                    toolResults.push({
                        name: 'Memory Deletion (Pending Confirmation)',
                        result: `I found this memory:\n\n🗑️ **Memory to delete:**\n"${bestMatch.memory.content}"\n\n⚠️ Please confirm to delete this memory.`
                    });
                } else {
                    // No match found - show available memories for reference
                    const memoryList = memories.slice(0, 5).map(m => `• "${m.content}"`).join('\n');
                    toolResults.push({
                        name: 'Memory Not Found',
                        result: `❌ I couldn't find a memory matching your request.\n\n**Your current memories:**\n${memoryList}\n\nPlease try again with more specific keywords.`
                    });
                }
            }
        }

        // Memory update tool - Now requires confirmation with SMART MATCHING
        if (requiredTools.includes('update_memory')) {
            console.log('[AI Update Memory] Triggered for message:', userMessage);

            // Try to extract "change X to Y" or "update X with Y" pattern
            const updatePatterns = [
                /(?:change|update|modify)\s+(?:my\s+)?(?:memory\s+)?(?:about\s+)?(.+?)\s+(?:to|with|into)\s+(.+)/i,
                /(?:change|update)\s+(.+?)\s+(?:to|with)\s+(.+)/i
            ];

            let oldPart = '';
            let newPart = '';

            for (const pattern of updatePatterns) {
                const match = userMessage.match(pattern);
                if (match) {
                    oldPart = match[1].trim();
                    newPart = match[2].trim();
                    break;
                }
            }

            console.log('[AI Update Memory] Parsed - Old:', oldPart, 'New:', newPart);

            if (!oldPart || !newPart) {
                toolResults.push({
                    name: 'Update Format',
                    result: `Please use a format like:\n• "Change my name from John to Daniel"\n• "Update morning summaries to weekly summaries"\n• "Modify my preference to: I prefer evening updates"`
                });
            } else {
                const memories = await getActiveMemories();

                // Extract keywords from oldPart to find matching memory
                const stopWords = ['my', 'the', 'a', 'an', 'that', 'this', 'preference', 'memory', 'fact', 'about', 'from'];
                const searchWords = oldPart.toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !stopWords.includes(word));

                console.log('[AI Update Memory] Search keywords:', searchWords);

                // Find best matching memory
                let bestMatch: { memory: typeof memories[0]; score: number } | null = null;

                for (const memory of memories) {
                    const memoryContent = memory.content.toLowerCase();
                    let score = 0;

                    for (const word of searchWords) {
                        if (memoryContent.includes(word)) {
                            score += 1;
                        }
                    }

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { memory, score };
                    }
                }

                if (bestMatch) {
                    console.log('[AI Update Memory] Best match found:', bestMatch.memory.content);

                    pendingAction = {
                        id: `update-memory-${Date.now()}`,
                        type: 'update_memory',
                        description: `Update memory from "${bestMatch.memory.content}" to "${newPart}"`,
                        data: { memoryId: bestMatch.memory.id, searchText: bestMatch.memory.content, newContent: newPart }
                    };

                    toolResults.push({
                        name: 'Memory Update (Pending Confirmation)',
                        result: `I found this memory:\n\n✏️ **Current:**\n"${bestMatch.memory.content}"\n\n✨ **New:**\n"${newPart}"\n\n⚠️ Please confirm to update this memory.`
                    });
                } else {
                    const memoryList = memories.slice(0, 5).map(m => `• "${m.content}"`).join('\n');
                    toolResults.push({
                        name: 'Memory Not Found',
                        result: `❌ I couldn't find a memory matching "${oldPart}".\n\n**Your current memories:**\n${memoryList}\n\nPlease try again with more specific keywords.`
                    });
                }
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
