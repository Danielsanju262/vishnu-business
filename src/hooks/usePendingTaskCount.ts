import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { useRealtimeTables } from './useRealtimeSync';

const STORAGE_KEY_PAYMENTS_VIEWED = 'vishnu_payments_viewed';
const STORAGE_KEY_PAYABLES_VIEWED = 'vishnu_payables_viewed';

interface ViewedData {
    date: string; // The date when this was last reset (YYYY-MM-DD)
    viewedIds: string[]; // Customer IDs (for payments) or Supplier IDs (for payables) that were viewed
}

/**
 * Gets the current "badge day" - the date after which viewed items should be reset.
 * If it's before 7 AM, we consider it the previous day.
 */
function getBadgeDate(): string {
    const now = new Date();
    const hour = now.getHours();

    // If before 7 AM, use yesterday's date
    if (hour < 7) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return format(yesterday, 'yyyy-MM-dd');
    }

    return format(now, 'yyyy-MM-dd');
}

/**
 * Gets viewed data from localStorage, handling daily reset at 7 AM.
 */
function getViewedData(storageKey: string): ViewedData {
    try {
        const stored = localStorage.getItem(storageKey);
        if (!stored) {
            return { date: getBadgeDate(), viewedIds: [] };
        }

        const parsed: ViewedData = JSON.parse(stored);
        const currentBadgeDate = getBadgeDate();

        // If the stored date is older than current badge date, reset the viewed items
        if (parsed.date !== currentBadgeDate) {
            const newData = { date: currentBadgeDate, viewedIds: [] };
            localStorage.setItem(storageKey, JSON.stringify(newData));
            return newData;
        }

        return parsed;
    } catch {
        return { date: getBadgeDate(), viewedIds: [] };
    }
}

/**
 * Marks an item as viewed in localStorage.
 */
function markAsViewed(storageKey: string, id: string): void {
    const data = getViewedData(storageKey);
    if (!data.viewedIds.includes(id)) {
        data.viewedIds.push(id);
        localStorage.setItem(storageKey, JSON.stringify(data));
    }
}

/**
 * Hook to mark a payment reminder customer as viewed.
 */
export function useMarkPaymentViewed() {
    return useCallback((customerId: string) => {
        markAsViewed(STORAGE_KEY_PAYMENTS_VIEWED, customerId);
        // Dispatch event so other components can update
        window.dispatchEvent(new CustomEvent('vishnu-badge-update'));
    }, []);
}

/**
 * Hook to mark an accounts payable supplier as viewed.
 */
export function useMarkPayableViewed() {
    return useCallback((supplierId: string) => {
        markAsViewed(STORAGE_KEY_PAYABLES_VIEWED, supplierId);
        // Dispatch event so other components can update
        window.dispatchEvent(new CustomEvent('vishnu-badge-update'));
    }, []);
}

interface NavBadgeCounts {
    insightsCount: number;
    paymentsCount: number;
    payablesCount: number;
}

/**
 * A hook to get badge counts for all nav items.
 * - Insights: Count of pending tasks (sales, expenses, reminders, payables due today/tomorrow/yesterday)
 * - Payments: Number of customers with pending reminders that haven't been viewed today
 * - Payables: Number of suppliers with pending payables that haven't been viewed today
 */
export function useNavBadgeCounts(): NavBadgeCounts {
    const [counts, setCounts] = useState<NavBadgeCounts>(() => {
        // Initialize from localStorage for immediate display
        try {
            const saved = localStorage.getItem('vishnu_nav_badge_counts');
            return saved ? JSON.parse(saved) : { insightsCount: 0, paymentsCount: 0, payablesCount: 0 };
        } catch {
            return { insightsCount: 0, paymentsCount: 0, payablesCount: 0 };
        }
    });

    const fetchCounts = useCallback(async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = format(yesterdayDate, 'yyyy-MM-dd');
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = format(tomorrowDate, 'yyyy-MM-dd');

        let insightsCount = 0;
        let paymentsCount = 0;
        let payablesCount = 0;

        try {
            // === INSIGHTS COUNT (pending tasks) ===

            // 1. Check for today's sales
            const { data: todaySales, error: salesError } = await supabase
                .from('transactions')
                .select('id')
                .eq('date', todayStr)
                .is('deleted_at', null)
                .limit(1);

            if (!salesError && (!todaySales || todaySales.length === 0)) {
                insightsCount++;
            }

            // 2. Check for today's expenses
            const { data: todayExpenses, error: expensesError } = await supabase
                .from('expenses')
                .select('id')
                .eq('date', todayStr)
                .is('deleted_at', null)
                .limit(1);

            if (!expensesError && (!todayExpenses || todayExpenses.length === 0)) {
                insightsCount++;
            }

            // 3. Check for payment reminders (Yesterday, Today, Tomorrow)
            const { data: recentReminders, error: remindersError } = await supabase
                .from('payment_reminders')
                .select('id')
                .eq('status', 'pending')
                .gte('due_date', yesterdayStr)
                .lte('due_date', tomorrowStr);

            if (!remindersError && recentReminders) {
                insightsCount += recentReminders.length;
            }

            // 4. Check for accounts payable (Yesterday, Today, Tomorrow)
            const { data: recentPayables, error: payablesError } = await supabase
                .from('accounts_payable')
                .select('id')
                .eq('status', 'pending')
                .gte('due_date', yesterdayStr)
                .lte('due_date', tomorrowStr);

            if (!payablesError && recentPayables) {
                insightsCount += recentPayables.length;
            }

            // === PAYMENTS COUNT (unviewed customers with pending reminders) ===
            const { data: allPendingReminders, error: allRemindersError } = await supabase
                .from('payment_reminders')
                .select('customer_id')
                .eq('status', 'pending');

            if (!allRemindersError && allPendingReminders) {
                // Get unique customer IDs
                const uniqueCustomerIds = [...new Set(allPendingReminders.map(r => r.customer_id))];

                // Get viewed customer IDs
                const viewedPayments = getViewedData(STORAGE_KEY_PAYMENTS_VIEWED);

                // Count unviewed customers
                paymentsCount = uniqueCustomerIds.filter(id => !viewedPayments.viewedIds.includes(id)).length;
            }

            // === PAYABLES COUNT (unviewed suppliers with pending payables) ===
            const { data: allPendingPayables, error: allPayablesError } = await supabase
                .from('accounts_payable')
                .select('supplier_id')
                .eq('status', 'pending');

            if (!allPayablesError && allPendingPayables) {
                // Get unique supplier IDs
                const uniqueSupplierIds = [...new Set(allPendingPayables.map(p => p.supplier_id))];

                // Get viewed supplier IDs
                const viewedPayables = getViewedData(STORAGE_KEY_PAYABLES_VIEWED);

                // Count unviewed suppliers
                payablesCount = uniqueSupplierIds.filter(id => !viewedPayables.viewedIds.includes(id)).length;
            }

            const newCounts = { insightsCount, paymentsCount, payablesCount };
            setCounts(newCounts);

            // Save to localStorage for immediate display on next load
            localStorage.setItem('vishnu_nav_badge_counts', JSON.stringify(newCounts));
        } catch (err) {
            console.error('[useNavBadgeCounts] Error:', err);
        }
    }, []);

    useEffect(() => {
        fetchCounts();

        // Listen for viewed updates
        const handleBadgeUpdate = () => fetchCounts();
        window.addEventListener('vishnu-badge-update', handleBadgeUpdate);

        // Check for 7 AM reset periodically (every minute)
        const intervalId = setInterval(() => {
            const now = new Date();
            if (now.getHours() === 7 && now.getMinutes() === 0) {
                // Clear viewed data at 7 AM
                localStorage.removeItem(STORAGE_KEY_PAYMENTS_VIEWED);
                localStorage.removeItem(STORAGE_KEY_PAYABLES_VIEWED);
                fetchCounts();
            }
        }, 60000);

        return () => {
            window.removeEventListener('vishnu-badge-update', handleBadgeUpdate);
            clearInterval(intervalId);
        };
    }, [fetchCounts]);

    // Real-time updates
    useRealtimeTables(['transactions', 'expenses', 'payment_reminders', 'accounts_payable'], fetchCounts);

    return counts;
}
