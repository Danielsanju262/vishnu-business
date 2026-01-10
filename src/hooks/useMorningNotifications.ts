
import { useEffect, useRef } from 'react';
import { useInsightsGenerator } from './useInsightsGenerator';
import { format } from 'date-fns';

export function useMorningNotifications() {
    const { tasks, isLoading } = useInsightsGenerator();
    const notificationPermissionRequested = useRef(false);

    useEffect(() => {
        // Request permission on mount (once)
        if (!notificationPermissionRequested.current && 'Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
            notificationPermissionRequested.current = true;
        }
    }, []);

    useEffect(() => {
        if (isLoading) return;

        const checkAndShowNotification = () => {
            const now = new Date();
            const todayStr = format(now, 'yyyy-MM-dd');
            const currentHour = now.getHours();

            // --- 7 AM Notification ---
            // Run loop between 7 AM and 10 AM (in case they open app late morning)
            const isMorning = currentHour >= 7 && currentHour < 10;
            const lastMorningShown = localStorage.getItem('last_morning_notification_date');

            if (isMorning && lastMorningShown !== todayStr && tasks.length > 0) {
                // Check backup status
                const backupDate = localStorage.getItem('vishnu_last_auto_backup');
                const backupDone = backupDate === now.toDateString();

                // If it's early morning (7:00 - 7:15) and backup isn't done yet,
                // wait for it to complete so we can include the backup success message.
                // The interval will check again every minute.
                if (!backupDone && now.getMinutes() < 15) {
                    return;
                }

                if ('Notification' in window && Notification.permission === 'granted') {
                    // Breakdown tasks
                    const paymentReminders = tasks.filter(t => t.source === 'payments').length;
                    const payables = tasks.filter(t => t.source === 'payables').length;
                    const otherTasks = tasks.length - paymentReminders - payables;

                    let bodyParts = [];
                    if (paymentReminders > 0) bodyParts.push(`${paymentReminders} payment reminder${paymentReminders !== 1 ? 's' : ''}`);
                    if (payables > 0) bodyParts.push(`${payables} payable${payables !== 1 ? 's' : ''}`);
                    if (otherTasks > 0) bodyParts.push(`${otherTasks} other task${otherTasks !== 1 ? 's' : ''}`);

                    let body = `You have ${tasks.length} tasks: ${bodyParts.join(', ')}.`;

                    if (backupDone) {
                        body += " Your data is backed up.";
                    }

                    sendNotification("Daily Business Update", body, todayStr, 'morning');
                }
            }

            // --- 9 PM Notification ---
            // Run loop between 9 PM and 11 PM
            const isEvening = currentHour >= 21 && currentHour < 23;
            const lastEveningShown = localStorage.getItem('last_evening_notification_date');

            if (isEvening && lastEveningShown !== todayStr && tasks.length > 0) {
                if ('Notification' in window && Notification.permission === 'granted') {
                    sendNotification(
                        "Pending Tasks",
                        "You haven't completed your tasks yet. Do it now!",
                        todayStr,
                        'evening'
                    );
                }
            }
        };

        const sendNotification = (title: string, body: string, dateStr: string, type: 'morning' | 'evening') => {
            try {
                // Try Service Worker first
                if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification(title, {
                            body: body,
                            icon: '/vite.svg',
                            tag: `${type}-insight-${dateStr}`,
                            data: { url: '/insights' }
                        });
                    });
                } else {
                    // Fallback
                    const notification = new Notification(title, {
                        body: body,
                        icon: '/vite.svg',
                    });

                    notification.onclick = () => {
                        window.focus();
                        window.location.href = '/insights';
                    };
                }

                // Mark as shown
                if (type === 'morning') {
                    localStorage.setItem('last_morning_notification_date', dateStr);
                } else {
                    localStorage.setItem('last_evening_notification_date', dateStr);
                }
            } catch (e) {
                console.error("Failed to show notification", e);
            }
        };

        // Check immediately
        checkAndShowNotification();

        // Check every minute
        const intervalId = setInterval(checkAndShowNotification, 60000);

        return () => clearInterval(intervalId);
    }, [tasks, isLoading]);
}
