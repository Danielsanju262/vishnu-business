export interface AIMemory {
    id: string;
    bucket: 'preference' | 'fact' | 'context';
    content: string;
    is_active: boolean;
    created_at: string;
}

export interface UserGoal {
    id: string;
    title: string;
    description?: string;
    target_amount: number;
    current_amount: number;
    deadline?: string;
    metric_type: 'net_profit' | 'revenue' | 'sales_count' | 'manual_check';
    status: 'active' | 'completed' | 'archived';
    start_tracking_date: string;
    metadata?: Record<string, any>; // For recurring rules etc
    created_at: string;
    is_recurring?: boolean;
    recurrence_type?: 'monthly' | 'weekly' | 'yearly';
    rollover_preference?: 'ask' | 'immediate' | 'first_of_month';
}

export interface AIChatSession {
    id: string;
    title: string;
    last_message_at: string;
    created_at: string;
}

export interface AIChatMessage {
    id: string;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tool_calls?: any;
    created_at: string;
}

export interface AIConfig {
    key: string;
    value: string;
    updated_at: string;
}
