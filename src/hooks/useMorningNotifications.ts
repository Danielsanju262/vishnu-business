
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
        if (isLoading || tasks.length === 0) return;

        const checkAndShowNotification = () => {
            const now = new Date();
            const todayStr = format(now, 'yyyy-MM-dd');
            const lastShown = localStorage.getItem('last_morning_notification_date');

            // Logic: 
            // 1. If it's past 7 AM and we haven't shown it today, show it.
            // 2. But we don't want to show it late at night if they open the app then. 
            //    Let's say show it if it's between 7 AM and 12 PM.

            const currentHour = now.getHours();
            const isMorning = currentHour >= 7 && currentHour < 12;

            if (isMorning && lastShown !== todayStr) {
                if ('Notification' in window && Notification.permission === 'granted') {
                    const taskCount = tasks.length;

                    try {
                        // Try Service Worker registration first for potentially better mobile support
                        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                            navigator.serviceWorker.ready.then(registration => {
                                registration.showNotification("Daily Business Tasks", {
                                    body: `You have ${taskCount} tasks to complete today. Ask AI for business insights!`,
                                    icon: '/vite.svg', // Fallback icon
                                    tag: 'morning-insight',
                                    data: { url: '/?action=view_tasks' }
                                });
                            });
                        } else {
                            // Fallback to standard Notification API
                            const notification = new Notification("Daily Business Tasks", {
                                body: `You have ${taskCount} tasks to complete today. Ask AI for business insights!`,
                                icon: '/vite.svg',
                            });

                            notification.onclick = () => {
                                window.focus();
                                window.location.href = '/?action=view_tasks';
                            };
                        }

                        localStorage.setItem('last_morning_notification_date', todayStr);
                    } catch (e) {
                        console.error("Failed to show notification", e);
                    }
                }
            }
        };

        // Check immediately
        checkAndShowNotification();

        // Set up a checker that runs every minute to catch 7 AM if app is open
        const intervalId = setInterval(() => {
            const now = new Date();
            if (now.getHours() === 7 && now.getMinutes() === 0) {
                // Force check
                checkAndShowNotification();
            }
        }, 60000);

        return () => clearInterval(intervalId);
    }, [tasks, isLoading]);
}
