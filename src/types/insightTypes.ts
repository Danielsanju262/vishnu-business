// Insight Types for the Daily Business Assistant

export type InsightType = 'task' | 'insight';
export type InsightSeverity = 'info' | 'success' | 'warning';
export type InsightSource = 'sales' | 'payments' | 'expenses' | 'payables' | 'general';

export interface InsightItem {
    id: string;
    type: InsightType;
    title: string;
    description?: string;
    severity: InsightSeverity;
    source: InsightSource;
    generated_date: string;
    expires_at?: string;
    cleared_at?: string;
    snoozed_until?: string;
    metadata?: Record<string, any>;
    created_at: string;
}

export interface InsightPreferences {
    id: number;
    notification_enabled: boolean;
    notification_time: string;
    updated_at: string;
}

// Snooze options
export interface SnoozeOption {
    label: string;
    value: number; // hours to add
    icon?: string;
}

export const SNOOZE_OPTIONS: SnoozeOption[] = [
    { label: '1 hour', value: 1 },
    { label: '3 hours', value: 3 },
    { label: 'Tomorrow morning', value: 24 },
    { label: 'Custom', value: -1 }, // -1 indicates custom picker
];

// AI Chat Message Types
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isLoading?: boolean;
}

// Quick Question Templates
export interface QuickQuestion {
    label: string;
    query: string;
    icon: string;
}

export const QUICK_QUESTIONS: QuickQuestion[] = [
    { label: "Who hasn't paid me this week?", query: "unpaid_this_week", icon: "💰" },
    { label: "How's this week vs last week?", query: "weekly_comparison", icon: "📊" },
    { label: "What's my top selling product?", query: "top_product", icon: "🏆" },
    { label: "Which customer delays payments?", query: "late_payers", icon: "⏰" },
    { label: "What should I focus on today?", query: "daily_focus", icon: "🎯" },
];
