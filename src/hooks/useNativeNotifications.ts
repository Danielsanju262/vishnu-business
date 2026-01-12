/**
 * Hook for scheduling native notifications.
 * 
 * This hook schedules notifications using Capacitor's Local Notifications plugin,
 * which shows notifications in the system notification bar even when the app is closed.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInsightsGenerator } from './useInsightsGenerator';
import { supabase } from '../lib/supabase';
import {
    isNativePlatform,
    requestNotificationPermission,
    scheduleMorningNotification,
    scheduleEveningNotification,
    schedulePaymentReminderNotification,
    setupNotificationClickListener,
    removeAllNotificationListeners,
} from '../lib/nativeNotifications';

export function useNativeNotifications() {
    const navigate = useNavigate();
    const { tasks, isLoading } = useInsightsGenerator();
    const hasSetupListeners = useRef(false);
    const lastScheduledDate = useRef<string>('');

    // Set up notification click listener once
    useEffect(() => {
        if (!hasSetupListeners.current && isNativePlatform()) {
            setupNotificationClickListener(navigate);
            hasSetupListeners.current = true;
        }

        return () => {
            removeAllNotificationListeners();
        };
    }, [navigate]);

    // Request permission and schedule notifications when tasks change
    useEffect(() => {
        if (isLoading) return;

        const scheduleNotifications = async () => {
            const todayStr = new Date().toISOString().split('T')[0];

            // Only reschedule once per day or when tasks change significantly
            if (lastScheduledDate.current === todayStr) {
                return;
            }

            // Request permission first
            const hasPermission = await requestNotificationPermission();
            if (!hasPermission) {
                console.log('[Notifications] Permission not granted');
                return;
            }

            // Get task count
            const tasksCount = tasks.length;

            // Schedule morning notification (7 AM)
            if (tasksCount > 0) {
                await scheduleMorningNotification(tasksCount);
            }

            // Schedule evening notification (9 PM)
            if (tasksCount > 0) {
                await scheduleEveningNotification(tasksCount);
            }

            // Check for payment reminders and schedule notification
            await schedulePaymentReminders();

            lastScheduledDate.current = todayStr;
        };

        scheduleNotifications();
    }, [tasks, isLoading]);

    /**
     * Schedule payment reminder notification by checking Supabase
     */
    async function schedulePaymentReminders() {
        try {
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            // Query for payments due today or before (overdue)
            const { data, error } = await supabase
                .from('payment_reminders')
                .select('id, amount')
                .eq('status', 'pending')
                .lte('due_date', todayStr);

            if (error) {
                console.error('[Notifications] Error checking reminders:', error);
                return;
            }

            if (data && data.length > 0) {
                const count = data.length;
                const totalAmount = data.reduce((sum, item) => sum + Number(item.amount), 0);
                await schedulePaymentReminderNotification(count, totalAmount);
            }
        } catch (error) {
            console.error('[Notifications] Failed to schedule payment reminders:', error);
        }
    }
}
