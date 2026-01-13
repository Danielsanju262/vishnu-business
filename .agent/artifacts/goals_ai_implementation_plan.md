# Goal Setting + AI Integration - Implementation Plan

## Overview
This plan implements the advanced goal tracking and AI allocation system for EMI/payment goals (manual allocation) and profit/revenue goals (automatic tracking).

---

## Phase 1: Database Schema Updates

### New Fields for `user_goals` table:
```sql
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'auto'; -- 'auto' | 'emi' | 'manual'
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC DEFAULT 0;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS allocation_start_date DATE;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS include_surplus BOOLEAN DEFAULT false;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
```

### New Table: `goal_allocations` (Track individual allocations)
```sql
CREATE TABLE IF NOT EXISTS goal_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID REFERENCES user_goals(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    source TEXT NOT NULL, -- 'surplus' | 'daily_profit' | 'manual'
    from_date DATE,
    to_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Phase 2: Type Updates (`src/types/aiTypes.ts`)

```typescript
export interface UserGoal {
    // Existing fields...
    id: string;
    title: string;
    description?: string;
    target_amount: number;
    current_amount: number;
    deadline?: string;
    metric_type: 'net_profit' | 'revenue' | 'sales_count' | 'manual_check';
    status: 'active' | 'completed' | 'archived';
    start_tracking_date: string;
    
    // New fields for EMI/allocation tracking
    goal_type: 'auto' | 'emi' | 'manual'; // auto = auto-track, emi = manual allocation
    allocated_amount: number; // Total manually allocated so far
    allocation_start_date?: string; // When user wants to start tracking for EMI
    include_surplus: boolean; // Whether to include pre-existing surplus
    reminder_enabled: boolean;
    completed_at?: string;
}

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
```

---

## Phase 3: AI Memory for Goal Tracking

### Store in `ai_memories` for reminder tracking:
- Remember allocation decisions
- Remember "start tracking from" dates
- Remember surplus preferences

### New AI Config Keys:
- `goal_reminder_frequency`: 'daily' | 'on_deadline' | 'both'

---

## Phase 4: New AI Tools (`src/lib/enhancedAI.ts`)

### 1. `toolListGoals` - List all goals with status
```typescript
async function toolListGoals(): Promise<string> {
    // Get all active goals
    // Format as: Active, Completed sections
    // Show progress, days left, daily run rate
}
```

### 2. `toolAllocateToGoal` - Allocate funds to EMI goal
```typescript
async function toolAllocateToGoal(
    goalTitle: string,
    amount: number,
    source: 'surplus' | 'daily_profit' | 'specific_date'
): Promise<string> {
    // Find matching goal
    // Calculate if amount is available
    // Create pending action for confirmation
    // Update goal.allocated_amount
    // Update goal.current_amount
}
```

### 3. `toolAddSurplusToGoal` - Add previous surplus
```typescript
async function toolAddSurplusToGoal(goalTitle: string): Promise<string> {
    // Calculate available surplus (net profit - completed EMIs)
    // Show amount available
    // Create pending action
    // On confirm: update goal
}
```

### 4. `toolSetGoalTrackingDate` - Set start date for EMI tracking
```typescript
async function toolSetGoalTrackingDate(
    goalTitle: string,
    startDate: string,
    includeSurplus: boolean
): Promise<string> {
    // Update goal.allocation_start_date
    // Update goal.include_surplus
    // Return confirmation
}
```

### 5. `toolCalculateSurplus` - Get available surplus
```typescript
async function toolCalculateSurplus(): Promise<string> {
    // Net profit since start of month
    // Minus all completed EMI goals this month
    // Return available amount
}
```

### 6. `toolCompleteGoal` - Mark goal as complete
```typescript
async function toolCompleteGoal(goalTitle: string): Promise<string> {
    // Find goal
    // Create pending action
    // On confirm: mark complete, move to completed list
}
```

### 7. `toolUpdateGoal` - Update goal details
```typescript
async function toolUpdateGoal(
    goalTitle: string,
    updates: { title?: string; amount?: number; deadline?: string }
): Promise<string> {
    // Find goal
    // Create pending action showing changes
    // On confirm: update database
}
```

### 8. `toolDeleteGoal` - Delete a goal
```typescript
async function toolDeleteGoal(goalTitle: string): Promise<string> {
    // Find goal
    // Create pending action
    // On confirm: archive goal
}
```

### 9. `toolCreateGoal` - Create new goal (ALREADY EXISTS, needs enhancement)
- Add support for goal_type: 'emi' when user mentions EMI
- Ask clarifying questions about allocation preferences

---

## Phase 5: Enhanced Goal Progress Calculation

### For Auto-Track Goals (net_profit, revenue, sales_count):
```typescript
current_amount = calculateMetricSince(start_tracking_date);
progress = (current_amount / target_amount) * 100;
```
- Updates automatically from sales data

### For EMI Goals (manual_check with manual allocation):
```typescript
current_amount = allocated_amount; // Sum of all allocations
if (allocation_start_date && include_surplus) {
    current_amount += surplus_from_before_date;
}
if (allocation_start_date) {
    current_amount += net_profit_since(allocation_start_date);
}
progress = (current_amount / target_amount) * 100;
```
- Only updates when user allocates via AI

---

## Phase 6: AI Conversation Flows

### Flow 1: Creating EMI Goal
```
User: "Set a goal for my bike EMI of 16000 due on 20th"

AI: "Got it! I'll create an EMI goal for you:
     📋 Title: Bike EMI
     💰 Amount: ₹16,000
     📅 Due: January 20th
     
     Is this correct? [Confirm] [Edit]"

[After confirm]
AI: "✅ EMI goal created!
     Your current net profit is ₹18,391.
     Would you like me to start allocating now?"
```

### Flow 2: Allocating to EMI
```
User: "Allocate to my bike EMI"

AI: "Your net profit this month: ₹18,391
     Bike EMI needs: ₹16,000
     
     Should I allocate ₹16,000 to complete it? [Yes] [Custom Amount]"

[After confirm]
AI: "✅ Done! Bike EMI is now 100% complete!
     Remaining surplus: ₹2,391
     
     You have another EMI due on 24th.
     Should I start allocating to it?"
```

### Flow 3: Start Tracking from Date
```
User: "Start tracking from 21st"

AI: "Got it! For your Car EMI:
     📅 Starting: January 21st
     
     Would you like to:
     1. 📦 Include previous surplus (₹2,391)
     2. 🆕 Start fresh (₹0)
     
     Which one?"

User: "Start fresh"

AI: "Perfect! I'll track your net profit from Jan 21st onwards.
     I'll remind you daily about progress. 💪"
```

### Flow 4: Adding Surplus Later
```
User: "Add the previous surplus too"

AI: "Sure! Adding ₹2,391 surplus to your Car EMI.
     
     New progress: ₹2,891 / ₹5,000 (58%)
     You need ₹2,109 more in 3 days.
     
     Keep going! You're doing great! 🚀"
```

### Flow 5: Goal Summary Query
```
User: "What are my goals?"

AI: "📊 Here's your goal summary:

     🔴 ACTIVE:
     1. 🚗 Car EMI - ₹2,891/₹5,000 (58%)
        Due: Jan 24th (3 days left)
        Need: ₹703/day
        
     2. 🎯 Revenue Target - ₹23,000/₹50,000 (46%)
        Due: Jan 31st (18 days left)
        Auto-tracking from sales ✓
        
     ✅ COMPLETED:
     1. 🏍️ Bike EMI - ₹16,000 ✓ (Jan 12th)
     
     💰 Available surplus: ₹2,391
     
     Need help with anything?"
```

---

## Phase 7: Daily Reminder System

### Morning Briefing Enhancement:
- Include goal progress summary
- Show daily run rate needed
- Context-aware motivation:
  - Easy target: "Great progress! You're on track!"
  - Challenging: "Push a little harder, you've got this!"
  - Impossible: "This is tough, but I believe in you!"
  - Missed: "It's okay! Want to adjust?"

### Reminder Logic:
```typescript
// In morning briefing or on-demand
for (const goal of activeGoals) {
    if (goal.goal_type === 'emi' && goal.reminder_enabled) {
        const daysLeft = getDaysLeft(goal.deadline);
        const remaining = goal.target_amount - goal.current_amount;
        const dailyNeeded = remaining / daysLeft;
        
        // Generate appropriate message
        if (remaining <= 0) {
            message = "🎉 You've collected enough! Ready to mark complete?";
        } else if (dailyNeeded < averageDailyProfit) {
            message = `Need ₹${dailyNeeded}/day - totally doable!`;
        } else if (dailyNeeded < averageDailyProfit * 1.5) {
            message = `Need ₹${dailyNeeded}/day - push a bit harder!`;
        } else {
            message = `Need ₹${dailyNeeded}/day - challenging but I trust you!`;
        }
    }
}
```

---

## Phase 8: Dashboard UI Updates

### GoalsDashboard.tsx Enhancements:
1. Show "Allocated" vs "Auto-tracked" indicator
2. Show allocation history for EMI goals
3. Show "Add Surplus" and "Start Tracking" buttons for EMI goals
4. Enhanced motivation messages with daily breakdown
5. Completed section with dates

---

## Implementation Order:

1. **Day 1**: Database migrations + Type updates
2. **Day 2**: Core AI tools (list, create, allocate, surplus)
3. **Day 3**: Advanced AI tools (update, delete, complete, tracking date)
4. **Day 4**: Conversation flow integration + detection
5. **Day 5**: Dashboard UI updates
6. **Day 6**: Morning briefing integration + reminders
7. **Day 7**: Testing + polish

---

## Files to Modify:

1. `src/types/aiTypes.ts` - Add new fields
2. `src/lib/aiMemory.ts` - Add calculation functions
3. `src/lib/enhancedAI.ts` - Add new tools and conversation flows
4. `src/pages/GoalsDashboard.tsx` - UI enhancements
5. `src/components/AI/GlobalAIWidget.tsx` - Handle goal pending actions
6. Database migration script

---

## Success Criteria:

✅ User can create EMI goal via chat
✅ AI asks about allocation preferences
✅ User can allocate from net profit
✅ User can choose "start fresh" or "use surplus"
✅ User can add surplus later
✅ Progress updates in dashboard in real-time
✅ Auto-track goals work without manual intervention
✅ Daily reminders with motivation
✅ User can query all goals anytime
✅ Both AI and manual dashboard updates sync
