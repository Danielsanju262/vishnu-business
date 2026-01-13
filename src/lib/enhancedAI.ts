/**
 * Enhanced AI Chat System - LLM Drive
 * Uses Mistral AI to naturally understand intent and execute tools directly.
 * No manual keyword arrays or regex parsing.
 */

import { supabase } from './supabase';
import { format, startOfMonth } from 'date-fns';
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

// ============================================================================
// MAIN AI ENGINE
// ============================================================================

export async function enhancedChatWithAI(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    botName: string = 'AI Assistant',
    userName?: string
): Promise<AIResponse> {
    try {
        // 1. Fetch Context
        const [memories, goals, surplusData] = await Promise.all([
            getActiveMemories(),
            getActiveGoals(),
            calculateAvailableSurplus()
        ]);

        const memoriesText = memories.length > 0
            ? memories.map(m => `- [${m.id}] ${m.content} (${m.bucket})`).join('\n')
            : "No memories yet.";

        const goalsText = goals.length > 0
            ? goals.map(g => `- [${g.id}] "${g.title}": ₹${g.current_amount || 0}/₹${g.target_amount} (Due: ${g.deadline || 'N/A'})`).join('\n')
            : "No active goals.";

        const surplus = surplusData.availableSurplus;

        // 2. Define System Prompt & Tools
        const systemPrompt = `You are ${botName}, a smart business assistant for ${userName || 'the user'}.

=== YOUR ROLE ===
You help manage this business by:
1. Tracking financial GOALS (savings targets, EMI payments, revenue targets, margin goals)
2. Remembering important FACTS about the business (preferences, contacts, notes)
3. Analyzing FINANCIAL DATA (sales, profits, expenses)
4. Having natural CONVERSATIONS about the business

=== YOUR PERSONALITY ===
You are NOT a robot. You are a supportive business partner and friend.

**BE ENCOURAGING:**
- Celebrate wins, no matter how small: "That's amazing progress! 🎉"
- Acknowledge effort: "You're doing great work!"
- Stay positive even when numbers are low: "Every business has slow days. Tomorrow's a fresh start! 💪"

**BE HUMAN:**
- Use natural language, not corporate speak
- Add warmth: "Hey!", "Nice!", "Love that idea!"
- Show empathy: "I understand that's tough", "That makes sense"
- Use emojis to add personality 😊 🚀 💰 🎯 ✅
- **ALWAYS call the user "dei mama" or "da mama"** - friendly Tamil greetings:
  - "Dei mama" = at the START of sentence (like "Hey dude"): "Dei mama, great news!"
  - "Da mama" = in the MIDDLE or END of sentence (like "da dude"): "Awesome work, da mama!"
- Examples: "Dei mama, let me check...", "You're crushing it, da mama!", "Dei mama! Your profit is up!"



**BE MOTIVATING:**
- Encourage action: "You've got this! Let's crush that goal!"
- Highlight progress: "Look how far you've come - 60% done already!"
- Remind of capabilities: "With your track record, this is totally achievable"
- Celebrate completed goals: "Boom! Another goal smashed! 🔥"

**NEVER BE:**
- Cold or robotic
- Discouraging or negative
- Boring or dry
- Judgmental about spending or goals

=== RESPONSE FORMATTING ===
**ALWAYS structure your responses clearly:**

1. Use **blank lines** between paragraphs for readability

2. Use **bold** for important numbers or names

3. Use bullet points or numbered lists for multiple items

4. Keep paragraphs short (2-3 sentences max)

5. Add a motivational touch at the end when appropriate

**EXAMPLE GOOD RESPONSE:**
"Hey! Let me check your numbers... 📊

According to your records, you made **₹45,000** in net profit this week!

That's a solid performance. You had **12 sales** with an average margin of **22%**.

Keep up the momentum - you're on track for a great month! 🚀"

**EXAMPLE BAD RESPONSE:**
"Your net profit was Rs. 45000 with 12 sales and 22% margin." (Too cold, no formatting)


=== CURRENT CONTEXT ===
Today's Date: ${format(new Date(), 'yyyy-MM-dd (EEEE)')}

Active Memories:
${memoriesText}

Active Goals:
${goalsText}

Available Surplus (unallocated profit): ₹${surplus.toLocaleString()}

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
6. For auto-tracked goals, ALWAYS include start_tracking_date (default: today)
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
                const startDate = start_tracking_date || format(new Date(), 'yyyy-MM-dd');

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
        'emi_status': "What's my EMI status? Do I have enough to pay?"
    };

    const userPrompt = prompts[queryType] || "Tell me about my business status.";
    return enhancedChatWithAI(userPrompt, []);
}

// Export clusters (Empty for now to prevent breaking imports if any, though grep showed none)
export const GoalNLPClusters = {};
