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
    metric_type: 'net_profit' | 'revenue' | 'sales_count' | 'manual_check' | 'customer_count' | 'gross_profit' | 'margin' | 'product_sales' | 'daily_revenue' | 'daily_margin' | 'avg_margin' | 'avg_revenue' | 'avg_profit';
    status: 'active' | 'completed' | 'archived';
    start_tracking_date: string;
    metadata?: Record<string, any>; // For recurring rules etc
    created_at: string;
    is_recurring?: boolean;
    recurrence_type?: 'monthly' | 'weekly' | 'yearly';
    rollover_preference?: 'ask' | 'immediate' | 'first_of_month';

    // New fields for EMI/allocation tracking
    goal_type?: 'auto' | 'emi' | 'manual'; // auto = auto-track from sales, emi = manual allocation
    allocated_amount?: number; // Total manually allocated so far for EMI goals
    allocation_start_date?: string; // When to start counting profit for this goal
    include_surplus?: boolean; // Whether to include pre-existing surplus
    reminder_enabled?: boolean; // Whether to remind about this goal
    completed_at?: string; // When the goal was completed

    // For product-specific goals
    product_id?: string; // Track sales of a specific product
}

// Track individual allocations to goals
export interface GoalAllocation {
    id: string;
    goal_id: string;
    amount: number;
    source: 'surplus' | 'daily_profit' | 'manual';
    from_date?: string;
    to_date?: string;
    notes?: string;
    created_at: string;
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
