import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function usePaymentNotifications() {
    const navigate = useNavigate();

    useEffect(() => {
        // Function to check and send notification
        const checkAndNotify = async () => {
            // 0. CHECK: Mobile Only (iOS/Android)
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (!isMobile) {
                // User requested notifications ONLY for mobile phones
                return;
            }

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            // 1. Check if we are past 6 AM today
            const sixAmToday = new Date(now);
            sixAmToday.setHours(6, 0, 0, 0);

            if (now < sixAmToday) {
                // It's too early (before 6 AM), don't notify yet
                return;
            }

            // 2. Check if we already notified YOU for this specific date
            const lastCheckDate = localStorage.getItem('vishnu_last_reminder_check_date');

            if (lastCheckDate === todayStr) {
                // Already notified for today
                return;
            }

            // 3. Check for browser support
            if (!("Notification" in window)) {
                return;
            }

            try {
                // 4. Query Supabase for payments due TODAY or BEFORE (Overdue)
                const { data, error } = await supabase
                    .from('payment_reminders')
                    .select('id, amount')
                    .eq('status', 'pending')
                    .lte('due_date', todayStr);

                if (error) {
                    console.error("[Notification] Error checking reminders:", error);
                    return;
                }

                if (data && data.length > 0) {
                    // 5. Request Permission if not already granted
                    let permission = Notification.permission;
                    if (permission === 'default') {
                        permission = await Notification.requestPermission();
                    }

                    if (permission === "granted") {
                        // 6. Send Notification
                        const count = data.length;
                        const totalAmount = data.reduce((sum, item) => sum + Number(item.amount), 0);
                        const title = "🌅 Morning Collection Reminder";
                        const body = `Good morning! You have ${count} payments to collect today (Total: ₹${totalAmount.toLocaleString()}).`;

                        // Mobile-friendly vibration pattern
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

                        const notification = new Notification(title, {
                            body,
                            icon: '/vite.svg',
                            tag: 'payment-reminders-daily-' + todayStr, // Unique tag per day
                            requireInteraction: true // Keep it visible
                        });

                        notification.onclick = function (e) {
                            e.preventDefault();
                            window.focus();
                            // Navigate to Insights page (now the default page)
                            navigate('/');
                            notification.close();
                        };

                        // 7. Mark as checked for today
                        localStorage.setItem('vishnu_last_reminder_check_date', todayStr);
                    }
                }
            } catch (error) {
                console.error("[Notification] Failed to check payment notifications", error);
            }
        };

        // Run immediately on mount
        checkAndNotify();

        // Check every minute (to handle the case where app is left open overnight)
        const intervalId = setInterval(checkAndNotify, 60 * 1000);

        return () => clearInterval(intervalId);
    }, [navigate]);
}
