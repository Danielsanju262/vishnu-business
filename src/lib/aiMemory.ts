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
    const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[AI Goals] Error fetching all goals:', error);
        return [];
    }

    return data || [];
}

export async function addGoal(goal: Omit<UserGoal, 'id' | 'created_at' | 'status' | 'current_amount'>): Promise<UserGoal | null> {
    const { data, error } = await supabase
        .from('user_goals')
        .insert({
            ...goal,
            current_amount: 0,
            status: 'active'
        })
        .select()
        .single();

    if (error) {
        console.error('[AI Goals] Error adding goal:', error);
        return null;
    }

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

    let currentAmount = 0;

    if (goal.metric_type === 'net_profit') {
        currentAmount = await calculateNetProfitSince(goal.start_tracking_date.split('T')[0]);
    } else if (goal.metric_type === 'revenue') {
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, quantity')
            .gte('date', goal.start_tracking_date.split('T')[0])
            .is('deleted_at', null);
        currentAmount = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
    } else if (goal.metric_type === 'sales_count') {
        const { count } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('date', goal.start_tracking_date.split('T')[0])
            .is('deleted_at', null);
        currentAmount = count || 0;
    }

    // Update the goal with new current amount
    await supabase
        .from('user_goals')
        .update({ current_amount: currentAmount })
        .eq('id', goalId);

    return { ...goal, current_amount: currentAmount };
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
