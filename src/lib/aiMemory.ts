/**
 * AI Memory Manager - Handles persistent storage and retrieval of AI memories
 * This is the "brain" that allows the AI to remember things about the user
 */

import { supabase } from './supabase';
import type { AIMemory, UserGoal, AIChatMessage, AIChatSession, AIConfig } from '../types/aiTypes';

// Re-export types for convenience
export type { AIMemory, UserGoal, AIChatMessage, AIChatSession, AIConfig };

// ===== AI CONFIG (Bot Name, User Name) =====
export async function getAIConfig(): Promise<Record<string, string>> {
    const { data } = await supabase
        .from('ai_config')
        .select('key, value');

    const config: Record<string, string> = {};
    data?.forEach(item => {
        config[item.key] = item.value;
    });

    return config;
}

export async function setAIConfig(key: string, value: string): Promise<void> {
    await supabase
        .from('ai_config')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ===== AI MEMORIES (Facts, Preferences, Context) =====
export async function getActiveMemories(): Promise<AIMemory[]> {
    const { data, error } = await supabase
        .from('ai_memories')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[AI Memory] Error fetching memories:', error);
        return [];
    }

    return data || [];
}

export async function addMemory(bucket: 'preference' | 'fact' | 'context', content: string): Promise<AIMemory | null> {
    // Check if we've hit the 30-memory limit
    const existingMemories = await getActiveMemories();
    if (existingMemories.length >= 30) {
        console.error('[AI Memory] Cannot add memory: limit of 30 reached');
        return null;
    }

    const { data, error } = await supabase
        .from('ai_memories')
        .insert({ bucket, content, is_active: true })
        .select()
        .single();

    if (error) {
        console.error('[AI Memory] Error adding memory:', error);
        return null;
    }

    return data;
}

export async function updateMemory(id: string, content: string): Promise<boolean> {
    const { error } = await supabase
        .from('ai_memories')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id);

    return !error;
}

export async function deleteMemory(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('ai_memories')
        .update({ is_active: false })
        .eq('id', id);

    return !error;
}

export async function hardDeleteMemory(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('ai_memories')
        .delete()
        .eq('id', id);

    return !error;
}

// ===== USER GOALS =====
export async function getActiveGoals(): Promise<UserGoal[]> {
    const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('status', 'active')
        .order('deadline', { ascending: true });

    if (error) {
        console.error('[AI Goals] Error fetching goals:', error);
        return [];
    }

    return data || [];
}

export async function getAllGoals(): Promise<UserGoal[]> {
    console.log('[AI Goals] Fetching all goals...');

    const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[AI Goals] Error fetching all goals:', error);
        console.error('[AI Goals] Error details:', JSON.stringify(error, null, 2));
        return [];
    }

    console.log('[AI Goals] Fetched goals:', data?.length || 0, 'goals');
    console.log('[AI Goals] Goals data:', data);
    return data || [];
}

export async function addGoal(goal: Omit<UserGoal, 'id' | 'created_at' | 'status' | 'current_amount'> & { current_amount?: number }): Promise<UserGoal | null> {
    // Build insert object, only including core fields that exist in all DB versions
    const insertData: any = {
        title: goal.title,
        target_amount: goal.target_amount,
        metric_type: goal.metric_type,
        start_tracking_date: goal.start_tracking_date,
        current_amount: goal.current_amount || 0, // Allow setting initial progress
        status: 'active'
    };

    // Only include truly optional fields if they have values
    if (goal.description) {
        insertData.description = goal.description;
    }
    if (goal.deadline) {
        insertData.deadline = goal.deadline;
    }
    if (goal.metadata) {
        insertData.metadata = goal.metadata;
    }

    // NOTE: is_recurring and recurrence_type are intentionally NOT included
    // to maintain compatibility with existing database schemas that don't have these columns.
    // After running the migration, these can be added back.

    console.log('[AI Goals] Inserting goal:', insertData);

    const { data, error } = await supabase
        .from('user_goals')
        .insert(insertData)
        .select()
        .single();

    if (error) {
        console.error('[AI Goals] Error adding goal:', error);
        console.error('[AI Goals] Error details:', JSON.stringify(error, null, 2));
        return null;
    }

    console.log('[AI Goals] Goal inserted successfully:', data);
    return data;
}

export async function updateGoal(id: string, updates: Partial<UserGoal>): Promise<boolean> {
    const { error } = await supabase
        .from('user_goals')
        .update(updates)
        .eq('id', id);

    return !error;
}

export async function completeGoal(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('user_goals')
        .update({ status: 'completed' })
        .eq('id', id);

    return !error;
}

export async function deleteGoal(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('user_goals')
        .update({ status: 'archived' })
        .eq('id', id);

    return !error;
}

// ===== CHAT SESSIONS & MESSAGES =====
export async function getOrCreateActiveSession(): Promise<AIChatSession | null> {
    // Get the most recent session
    const { data: sessions } = await supabase
        .from('ai_chat_sessions')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(1);

    if (sessions && sessions.length > 0) {
        // Check if session is from today (we create a new one daily for fresh context)
        const sessionDate = new Date(sessions[0].last_message_at);
        const today = new Date();
        const isSameDay = sessionDate.toDateString() === today.toDateString();

        if (isSameDay) {
            return sessions[0];
        }
    }

    // Create a new session
    const { data: newSession, error } = await supabase
        .from('ai_chat_sessions')
        .insert({ title: `Chat - ${new Date().toLocaleDateString()}` })
        .select()
        .single();

    if (error) {
        console.error('[AI Chat] Error creating session:', error);
        return null;
    }

    return newSession;
}

export async function getChatMessages(sessionId: string): Promise<AIChatMessage[]> {
    const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[AI Chat] Error fetching messages:', error);
        return [];
    }

    return data || [];
}

export async function addChatMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    toolCalls?: any
): Promise<AIChatMessage | null> {
    const { data, error } = await supabase
        .from('ai_chat_messages')
        .insert({ session_id: sessionId, role, content, tool_calls: toolCalls })
        .select()
        .single();

    if (error) {
        console.error('[AI Chat] Error adding message:', error);
        return null;
    }

    // Update session's last_message_at
    await supabase
        .from('ai_chat_sessions')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', sessionId);

    return data;
}

export async function clearChatSession(sessionId: string): Promise<boolean> {
    const { error } = await supabase
        .from('ai_chat_messages')
        .delete()
        .eq('session_id', sessionId);

    return !error;
}

// ===== FINANCIAL CALCULATIONS =====
export async function calculateNetProfitSince(startDate: string): Promise<number> {
    // Get total revenue since start date
    const { data: sales } = await supabase
        .from('transactions')
        .select('sell_price, buy_price, quantity')
        .gte('date', startDate)
        .is('deleted_at', null);

    const revenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
    const cost = (sales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);

    // Get total expenses since start date
    const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .gte('date', startDate)
        .is('deleted_at', null);

    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

    return revenue - cost - totalExpenses;
}

// Calculate available surplus (net profit minus completed EMI/payment goals)
export async function calculateAvailableSurplus(): Promise<{
    netProfitThisMonth: number;
    completedEMIsTotal: number;
    availableSurplus: number;
}> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Get net profit this month
    const netProfitThisMonth = await calculateNetProfitSince(startOfMonth);

    // Get all completed EMI goals this month (goals with goal_type = 'emi' or metric_type = 'manual_check' that are completed)
    const { data: completedGoals } = await supabase
        .from('user_goals')
        .select('*')
        .eq('status', 'completed')
        .gte('completed_at', startOfMonth);

    // Sum up the target amounts of completed EMI goals
    const completedEMIsTotal = (completedGoals || [])
        .filter(g => g.metric_type === 'manual_check' || g.goal_type === 'emi')
        .reduce((sum, g) => sum + g.target_amount, 0);

    return {
        netProfitThisMonth,
        completedEMIsTotal,
        availableSurplus: Math.max(0, netProfitThisMonth - completedEMIsTotal)
    };
}

// Calculate net profit for a specific date range
export async function calculateNetProfitBetween(startDate: string, endDate: string): Promise<number> {
    const { data: sales } = await supabase
        .from('transactions')
        .select('sell_price, buy_price, quantity')
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null);

    const revenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
    const cost = (sales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);

    const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null);

    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

    return revenue - cost - totalExpenses;
}

// Allocate amount to a goal
export async function allocateToGoal(
    goalId: string,
    amount: number,
    _source: 'surplus' | 'daily_profit' | 'manual' = 'manual'
): Promise<boolean> {
    // Get current goal
    const { data: goal } = await supabase
        .from('user_goals')
        .select('*')
        .eq('id', goalId)
        .single();

    if (!goal) return false;

    // Update goal's current_amount and allocated_amount
    const newCurrentAmount = (goal.current_amount || 0) + amount;
    const newAllocatedAmount = (goal.allocated_amount || 0) + amount;

    const { error } = await supabase
        .from('user_goals')
        .update({
            current_amount: newCurrentAmount,
            allocated_amount: newAllocatedAmount
        })
        .eq('id', goalId);

    if (error) {
        console.error('[Goal Allocation] Error:', error);
        return false;
    }

    // Dispatch event for UI refresh
    window.dispatchEvent(new Event('goal-updated'));

    return true;
}

// Complete a goal and set completed_at timestamp
export async function completeGoalWithTimestamp(goalId: string): Promise<boolean> {
    const { error } = await supabase
        .from('user_goals')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString()
        })
        .eq('id', goalId);

    if (!error) {
        window.dispatchEvent(new Event('goal-updated'));
    }

    return !error;
}

// ===== WATERFALL GOAL LOGIC =====
export interface WaterfallGoalStatus {
    goal: UserGoal;
    allocatedAmount: number; // How much of the current 'pool' is assigned here
    remainingNeeded: number; // target - allocated
    daysLeft: number;
    dailyRunRate: number; // remaining / daysLeft
    isFullyFunded: boolean;
    statusMessage: string; // The motivational message
}

export async function calculateWaterfallGoals(): Promise<WaterfallGoalStatus[]> {
    // 1. Get all active goals sorted by deadline
    const goals = await getActiveGoals(); // Already sorted by deadline
    if (goals.length === 0) return [];

    // 2. Calculate Total Available "Pool" (Net Profit This Month)
    // We assume the "pool" is the Net Profit for the current month because usually EMI/Goals are paid from monthly income.
    // If a goal started *before* this month, we might need a different pool, but "Net Profit This Month" is the safest "Active Cash Flow" metric for now.
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    let availablePool = await calculateNetProfitSince(startOfMonth);

    // Ensure pool isn't negative for allocation purposes
    if (availablePool < 0) availablePool = 0;

    const results: WaterfallGoalStatus[] = [];

    for (const goal of goals) {
        // Calculate days left
        let daysLeft = 0;
        if (goal.deadline) {
            daysLeft = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        }

        // Waterfall Allocation
        const amountNeeded = goal.target_amount;
        const allocated = Math.min(availablePool, amountNeeded);

        // Deduct from pool for next goal
        availablePool -= allocated;

        const remaining = amountNeeded - allocated;
        const isFullyFunded = remaining <= 0;

        let dailyRunRate = 0;
        if (!isFullyFunded && daysLeft > 0) {
            dailyRunRate = remaining / daysLeft;
        }

        // Generate Message
        let statusMessage = '';
        if (isFullyFunded) {
            statusMessage = `🎉 You've allocated enough (₹${allocated.toLocaleString()}) to cover this! Great job!`;
        } else {
            statusMessage = `You have ₹${allocated.toLocaleString()} allocated. Need ₹${remaining.toLocaleString()} more.`;
            if (daysLeft > 0) {
                statusMessage += ` That's ~₹${Math.ceil(dailyRunRate).toLocaleString()}/day for ${daysLeft} days. You can do it! 💪`;
            } else if (daysLeft === 0) {
                statusMessage += ` Due TODAY! Push hard! 🔥`;
            } else {
                statusMessage += ` Overdue by ${Math.abs(daysLeft)} days. Prioritize this! 🚨`;
            }
        }

        results.push({
            goal,
            allocatedAmount: allocated,
            remainingNeeded: remaining,
            daysLeft,
            dailyRunRate,
            isFullyFunded,
            statusMessage
        });
    }

    return results;
}


export async function updateGoalProgress(goalId: string): Promise<UserGoal | null> {
    // Get the goal
    const { data: goal } = await supabase
        .from('user_goals')
        .select('*')
        .eq('id', goalId)
        .single();

    if (!goal) return null;

    // Use existing amount as default, in case we don't recalculate (e.g. manual_check)
    let currentAmount = goal.current_amount;
    let shouldUpdate = false;

    // For EMI/Manual goals - NEVER recalculate, user updates manually
    if (goal.metric_type === 'manual_check' || goal.goal_type === 'emi') {
        return goal;
    }

    // For auto-tracked profit/revenue goals
    const trackingStartDate = goal.start_tracking_date.split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // Determine the end date for calculations
    // If a deadline exists and is in the past, stop calculating at the deadline
    // Otherwise, calculate up to today
    let effectiveEndDate = todayStr;
    if (goal.deadline && goal.deadline < todayStr) {
        effectiveEndDate = goal.deadline;
    }

    if (goal.metric_type === 'net_profit') {
        currentAmount = await calculateNetProfitBetween(trackingStartDate, effectiveEndDate);
        shouldUpdate = true;
    } else if (goal.metric_type === 'revenue') {
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, quantity')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null);
        currentAmount = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
        shouldUpdate = true;
    } else if (goal.metric_type === 'sales_count') {
        const { count } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null);
        currentAmount = count || 0;
        shouldUpdate = true;
    } else if (goal.metric_type === 'gross_profit') {
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, buy_price, quantity')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null);

        const revenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
        const cost = (sales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);
        currentAmount = revenue - cost;
        shouldUpdate = true;

    } else if (goal.metric_type === 'margin' || goal.metric_type === 'daily_margin') {
        // For margin/daily_margin goals: check if ANY day within the period achieves the target margin
        // Get all transactions grouped by date
        const { data: sales } = await supabase
            .from('transactions')
            .select('date, sell_price, buy_price, quantity')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null)
            .order('date', { ascending: true });

        if (sales && sales.length > 0) {
            // Group transactions by date
            const salesByDate: Record<string, { revenue: number; cost: number }> = {};

            for (const sale of sales) {
                const dateKey = sale.date;
                if (!salesByDate[dateKey]) {
                    salesByDate[dateKey] = { revenue: 0, cost: 0 };
                }
                salesByDate[dateKey].revenue += sale.sell_price * sale.quantity;
                salesByDate[dateKey].cost += sale.buy_price * sale.quantity;
            }

            // Check each day's margin
            let highestMargin = 0;
            let targetAchieved = false;

            for (const dateKey of Object.keys(salesByDate)) {
                const dayData = salesByDate[dateKey];
                if (dayData.revenue > 0) {
                    const dayMargin = ((dayData.revenue - dayData.cost) / dayData.revenue) * 100;

                    // Track highest margin achieved
                    if (dayMargin > highestMargin) {
                        highestMargin = dayMargin;
                    }

                    // Check if this day achieved the target
                    if (dayMargin >= goal.target_amount) {
                        targetAchieved = true;
                        break; // Goal achieved, no need to check more days
                    }
                }
            }

            // If target achieved on any day, set current to target (100% progress)
            // Otherwise, show the highest margin achieved so far
            currentAmount = targetAchieved ? goal.target_amount : highestMargin;
        } else {
            currentAmount = 0;
        }
        shouldUpdate = true;
    } else if (goal.metric_type === 'daily_revenue') {
        // Check if ANY single day achieves the target revenue
        const { data: sales } = await supabase
            .from('transactions')
            .select('date, sell_price, quantity')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null);

        if (sales && sales.length > 0) {
            const salesByDate: Record<string, number> = {};

            for (const sale of sales) {
                const dateKey = sale.date;
                salesByDate[dateKey] = (salesByDate[dateKey] || 0) + (sale.sell_price * sale.quantity);
            }

            let highestRevenue = 0;
            let targetAchieved = false;

            for (const dateKey of Object.keys(salesByDate)) {
                const dayRevenue = salesByDate[dateKey];
                if (dayRevenue > highestRevenue) highestRevenue = dayRevenue;
                if (dayRevenue >= goal.target_amount) {
                    targetAchieved = true;
                    break;
                }
            }

            currentAmount = targetAchieved ? goal.target_amount : highestRevenue;
        } else {
            currentAmount = 0;
        }
        shouldUpdate = true;
    } else if (goal.metric_type === 'avg_margin') {
        // Calculate total average margin over the period (Total Revenue - Total Cost) / Total Revenue
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, buy_price, quantity')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null);

        const revenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
        const cost = (sales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);

        if (revenue > 0) {
            currentAmount = ((revenue - cost) / revenue) * 100;
        } else {
            currentAmount = 0;
        }
        shouldUpdate = true;
    } else if (goal.metric_type === 'avg_revenue') {
        // Total Revenue / Number of Days
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, quantity')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null);

        const totalRevenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);

        // Calculate days elapsed (at least 1)
        const start = new Date(trackingStartDate);
        const end = new Date(effectiveEndDate);
        // Add 1 day to end date to make it inclusive if we are just subtracting timestamps? 
        // No, calculate days between dates.
        const diffTime = Math.abs(end.getTime() - start.getTime());
        // Add 1 to count the start date itself as a day
        const daysElapsed = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

        currentAmount = totalRevenue / daysElapsed;
        shouldUpdate = true;
    } else if (goal.metric_type === 'avg_profit') {
        // Total Net Profit / Number of Days
        const totalProfit = await calculateNetProfitBetween(trackingStartDate, effectiveEndDate);

        const start = new Date(trackingStartDate);
        const end = new Date(effectiveEndDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const daysElapsed = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

        currentAmount = totalProfit / daysElapsed;
        shouldUpdate = true;
    } else if (goal.metric_type === 'customer_count') {
        // Count unique customers who made purchases
        const { data: sales } = await supabase
            .from('transactions')
            .select('customer_id')
            .gte('date', trackingStartDate)
            .lte('date', effectiveEndDate)
            .is('deleted_at', null)
            .not('customer_id', 'is', null);

        const uniqueCustomers = new Set((sales || []).map(s => s.customer_id));
        currentAmount = uniqueCustomers.size;
        shouldUpdate = true;
    } else if (goal.metric_type === 'product_sales') {
        // Track sales of a specific product
        if (goal.product_id) {
            const { data: sales } = await supabase
                .from('transactions')
                .select('quantity')
                .eq('product_id', goal.product_id)
                .gte('date', trackingStartDate)
                .lte('date', effectiveEndDate)
                .is('deleted_at', null);

            currentAmount = (sales || []).reduce((sum, t) => sum + t.quantity, 0);
            shouldUpdate = true;
        }
    }


    // Auto-complete validation
    if (currentAmount >= goal.target_amount && goal.status !== 'completed') {
        await completeGoalWithTimestamp(goalId);
        return {
            ...goal,
            current_amount: currentAmount,
            status: 'completed',
            completed_at: new Date().toISOString()
        };
    }

    // Only update if we calculated a new value (for auto-trackers) 
    // AND the value is actually different to avoid unnecessary writes
    if (shouldUpdate && currentAmount !== goal.current_amount) {
        await supabase
            .from('user_goals')
            .update({ current_amount: currentAmount })
            .eq('id', goalId);
        return { ...goal, current_amount: currentAmount };
    }


    return goal;
}

// ===== MORNING BRIEFING =====
export interface MorningBriefing {
    totalPendingTasks: number;
    overduePaymentReminders: Array<{ customerName: string; amount: number; daysPastDue: number }>;
    todayPaymentReminders: Array<{ customerName: string; amount: number }>;
    overduePayables: Array<{ supplierName: string; amount: number; daysPastDue: number }>;
    todayPayables: Array<{ supplierName: string; amount: number }>;
    activeGoals: Array<{ title: string; current: number; target: number; deadline?: string; daysLeft?: number }>;
    netProfitToday: number;
    netProfitThisMonth: number;
    briefingTitle?: string;
    waterfallGoals?: WaterfallGoalStatus[];
}

export async function generateMorningBriefing(): Promise<MorningBriefing> {
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Get overdue and today's payment reminders
    const { data: reminders } = await supabase
        .from('payment_reminders')
        .select('amount, due_date, customers(name)')
        .eq('status', 'pending')
        .is('deleted_at', null)
        .lte('due_date', todayStr);

    const overduePaymentReminders: MorningBriefing['overduePaymentReminders'] = [];
    const todayPaymentReminders: MorningBriefing['todayPaymentReminders'] = [];

    (reminders || []).forEach((r: any) => {
        const daysPastDue = Math.floor((new Date().getTime() - new Date(r.due_date).getTime()) / (1000 * 60 * 60 * 24));
        if (r.due_date === todayStr) {
            todayPaymentReminders.push({ customerName: r.customers?.name || 'Unknown', amount: r.amount });
        } else if (daysPastDue > 0) {
            overduePaymentReminders.push({ customerName: r.customers?.name || 'Unknown', amount: r.amount, daysPastDue });
        }
    });

    // Get overdue and today's payables
    const { data: payables } = await supabase
        .from('accounts_payable')
        .select('amount, due_date, suppliers(name)')
        .eq('status', 'pending')
        .is('deleted_at', null)
        .lte('due_date', todayStr);

    const overduePayables: MorningBriefing['overduePayables'] = [];
    const todayPayables: MorningBriefing['todayPayables'] = [];

    (payables || []).forEach((p: any) => {
        const daysPastDue = Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24));
        if (p.due_date === todayStr) {
            todayPayables.push({ supplierName: p.suppliers?.name || 'Unknown', amount: p.amount });
        } else if (daysPastDue > 0) {
            overduePayables.push({ supplierName: p.suppliers?.name || 'Unknown', amount: p.amount, daysPastDue });
        }
    });

    // Get active goals with progress
    const { data: goals } = await supabase
        .from('user_goals')
        .select('*')
        .eq('status', 'active');

    const activeGoals: MorningBriefing['activeGoals'] = [];

    for (const goal of goals || []) {
        const updated = await updateGoalProgress(goal.id);
        if (updated) {
            let daysLeft: number | undefined;
            if (updated.deadline) {
                daysLeft = Math.ceil((new Date(updated.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            }
            activeGoals.push({
                title: updated.title,
                current: updated.current_amount,
                target: updated.target_amount,
                deadline: updated.deadline,
                daysLeft
            });
        }
    }

    // Calculate net profit
    const netProfitToday = await calculateNetProfitSince(todayStr);
    const netProfitThisMonth = await calculateNetProfitSince(startOfMonth);

    const totalPendingTasks = overduePaymentReminders.length + todayPaymentReminders.length +
        overduePayables.length + todayPayables.length;

    // Generate Morning Briefing with Waterfall Logic
    const waterfallGoals = await calculateWaterfallGoals();

    // Get user name for greeting
    const { user_name } = await getAIConfig();
    const briefingTitle = `Hi ${user_name || 'there'}, hope you are doing great today! 🌟`;

    return {
        briefingTitle,
        totalPendingTasks,
        overduePaymentReminders,
        todayPaymentReminders,
        overduePayables,
        todayPayables,
        activeGoals, // Keep original for reference if needed
        waterfallGoals, // New logic
        netProfitToday,
        netProfitThisMonth
    };
}

// ===== BRIEFING READ STATUS (Per Device) =====
const BRIEFING_READ_KEY = 'ai_briefing_last_read';

export function hasReadTodaysBriefing(): boolean {
    const lastRead = localStorage.getItem(BRIEFING_READ_KEY);
    if (!lastRead) return false;

    const lastReadDate = new Date(lastRead);
    const today = new Date();

    return lastReadDate.toDateString() === today.toDateString();
}

export function markBriefingAsRead(): void {
    localStorage.setItem(BRIEFING_READ_KEY, new Date().toISOString());
}
