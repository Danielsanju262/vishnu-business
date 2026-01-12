import { supabase } from './supabase';
import { format } from 'date-fns';



// Mistral AI Configuration
// Using mistral-large-latest for top-tier intelligence
const MISTRAL_API_KEY = 'ZUfHndqE4M5ES7S0aXwHsyE9s8oPs0cr';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

// Strictly typed business data
interface BusinessData {
    todaySales: number;
    todayExpenses: number;
    pendingReceivables: number;
    pendingPayables: number;
    recentTransactions: string; // Formatted list of recent sales
    recentExpenses: string;    // Formatted list of recent expenses
    pendingPaymentsList: string; // Detailed list of who owes money
}

// Helper to safely get name from joined relation
const getName = (relation: any): string => {
    if (Array.isArray(relation)) {
        return relation[0]?.name || 'Unknown';
    }
    return relation?.name || 'Unknown';
};

// Fetch detailed business context
async function getBusinessContext(): Promise<BusinessData> {
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. Get detailed recent transactions (Last 20)
    const { data: sales } = await supabase
        .from('transactions')
        .select(`
            date,
            quantity,
            sell_price,
            product:products(name),
            customer:customers(name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

    const recentTransactions = (sales || []).map((t: any) =>
        `- ${t.date}: Sold ${t.quantity}x ${getName(t.product)} to ${getName(t.customer)} for ₹${t.sell_price * t.quantity}`
    ).join('\n');

    const todaySales = (sales || [])
        .filter((t: any) => t.date === todayStr)
        .reduce((sum: number, t: any) => sum + (t.sell_price * t.quantity), 0);

    // 2. Get detailed recent expenses (Last 10)
    const { data: expenses } = await supabase
        .from('expenses')
        .select('date, amount, note, category')
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(10);

    const recentExpenses = (expenses || []).map((e: any) =>
        `- ${e.date}: ₹${e.amount} for ${e.category || 'Expense'} (${e.note || ''})`
    ).join('\n');

    const todayExpenses = (expenses || [])
        .filter((e: any) => e.date === todayStr)
        .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

    // 3. Get all pending receivables (People who owe money)
    const { data: receivables } = await supabase
        .from('payment_reminders')
        .select(`
            amount,
            due_date,
            status,
            customer:customers(name)
        `)
        .eq('status', 'pending')
        .order('due_date', { ascending: true });

    const pendingPaymentsList = (receivables || []).map((r: any) =>
        `- ${getName(r.customer)} owes ₹${r.amount} (Due: ${r.due_date})`
    ).join('\n');

    const pendingReceivables = (receivables || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

    // 4. Get pending payables
    const { data: payables } = await supabase
        .from('accounts_payable')
        .select('amount')
        .eq('status', 'pending');

    const pendingPayables = (payables || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    return {
        todaySales,
        todayExpenses,
        pendingReceivables,
        pendingPayables,
        recentTransactions: recentTransactions || "No recent sales.",
        recentExpenses: recentExpenses || "No recent expenses.",
        pendingPaymentsList: pendingPaymentsList || "No pending payments.",
    };
}

// AI chat using Mistral API
interface AIResponse {
    text: string;
    usage: {
        used: number;    // Tokens used in this request
        limit: number;   // Total limit
        resetInSeconds: number | null; // Seconds until reset
    };
}

// Core AI logic for Business Insights
export async function chatWithAI(userMessage: string, history: any[], botName: string = "Via AI"): Promise<AIResponse> {
    try {
        // 1. Get real-time business context
        const context = await getBusinessContext();

        // 2. Construct System Prompt with Context
        const systemPrompt = `
You are ${botName}, a smart business assistant for this shop owner.
Your goal is to provide concise, data-driven answers based on the logs below.

[RECENT SALES LOG (Last 20)]
${context.recentTransactions}

[PENDING PAYMENTS (Who owes money)]
${context.pendingPaymentsList}

[RECENT EXPENSES (Last 10)]
${context.recentExpenses}

[SUMMARY]
- Today's Total Sales: ₹${context.todaySales.toLocaleString()}
- Today's Total Expenses: ₹${context.todayExpenses.toLocaleString()}
- Total To Collect: ₹${context.pendingReceivables.toLocaleString()}

INSTRUCTIONS:
1. When asked about specific people or items, LOOK at the logs above.
2. If asked "Who bought X?", check the Sales Log.
3. If asked "Who owes me?", check the Pending Payments.
4. Be direct and helpful. No fluff.
5. If the data isn't in the logs above, say "I don't see that in the recent records."
`;

        // Format history for Mistral API (OpenAI compatible)
        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            { role: "user", content: userMessage }
        ];

        // Call Mistral API
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-large-latest",
                messages: messages,
                temperature: 0.4,
                max_tokens: 600,
            })
        });

        if (!response.ok) {
            console.warn('[Mistral] API error:', response.status, response.statusText);
            const errorBody = await response.text();
            console.warn('Error body:', errorBody);

            if (response.status === 401) return { text: "Invalid API Key. Please check your settings.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            if (response.status === 429) return { text: "Rate limit exceeded. Please try again in a moment.", usage: { used: 0, limit: 0, resetInSeconds: null } };

            return { text: `Mistral Error (${response.status}).`, usage: { used: 0, limit: 0, resetInSeconds: null } };
        }

        // Try to read rate limits from headers
        const limitMonth = response.headers.get('x-ratelimit-limit-tokens-month');
        const resetMonth = response.headers.get('x-ratelimit-reset-tokens-month'); // Strict monthly reset

        // Fallback or parsed limit
        const apiLimit = limitMonth ? parseInt(limitMonth, 10) : 1000000;
        const apiReset = resetMonth ? parseInt(resetMonth, 10) : null;

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "I couldn't process that.";
        const usedTokens = data.usage?.total_tokens || 0;

        return {
            text,
            usage: {
                used: usedTokens,
                limit: apiLimit,
                resetInSeconds: apiReset
            }
        };

    } catch (error) {
        console.error('[AI Chat] Error:', error);
        return { text: "Network Error. Please check your internet.", usage: { used: 0, limit: 0, resetInSeconds: null } };
    }
}

// Handle pre-built queries by just passing them to the AI
// This ensures they also benefit from the enriched context
export async function handleQuickQuery(queryType: string, botName: string = "Via AI"): Promise<AIResponse> {
    const prompts: Record<string, string> = {
        'unpaid_this_week': "Who hasn't paid me this week? List them out.",
        'weekly_comparison': "How are my sales this week compared to last week?",
        'top_product': "What is my top selling product recently?",
        'late_payers': "Which customers are delaying payments?",
        'daily_focus': "What should I focus on today based on plain pending tasks?"
    };

    const userPrompt = prompts[queryType] || "Tell me about my business status.";
    return chatWithAI(userPrompt, [], botName);
}


