/**
 * Native Notifications Service using Capacitor Local Notifications.
 * 
 * This service schedules notifications that appear in the system notification bar
 * even when the app is closed or in the background.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import type { ScheduleOptions, PendingLocalNotificationSchema } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// Notification IDs (using constants to avoid duplicates)
export const NOTIFICATION_IDS = {
    MORNING_TASKS: 7001,
    EVENING_REMINDER: 9001,
    PAYMENT_REMINDER: 6001,
    BACKUP_REMINDER: 7002,
    SECURITY_ALERT: 8001,
} as const;

/**
 * Check if we're running on a native platform (iOS/Android)
 */
export function isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
}

/**
 * Request notification permissions from the user.
 * Returns true if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
    if (!isNativePlatform()) {
        // Fallback to web notification API for PWA
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    }

    try {
        // Create notification channel first (required for Android 8+)
        await createNotificationChannel();

        const permission = await LocalNotifications.requestPermissions();
        return permission.display === 'granted';
    } catch (error) {
        console.error('[Notifications] Failed to request permission:', error);
        return false;
    }
}

/**
 * Create notification channel for Android 8+ (Oreo and above)
 * This is REQUIRED for notifications to appear on modern Android devices.
 */
export async function createNotificationChannel(): Promise<void> {
    if (!isNativePlatform()) return;

    try {
        await LocalNotifications.createChannel({
            id: 'vishnu_business_reminders',
            name: 'Business Reminders',
            description: 'Payment reminders, task notifications, and business alerts',
            importance: 5, // Max importance
            visibility: 1, // Public
            sound: 'default',
            vibration: true,
            lights: true,
        });
        console.log('[Notifications] Channel created successfully');
    } catch (error) {
        console.error('[Notifications] Failed to create channel:', error);
    }
}

/**
 * Check current notification permission status.
 */
export async function checkNotificationPermission(): Promise<boolean> {
    if (!isNativePlatform()) {
        if ('Notification' in window) {
            return Notification.permission === 'granted';
        }
        return false;
    }

    try {
        const permission = await LocalNotifications.checkPermissions();
        return permission.display === 'granted';
    } catch (error) {
        console.error('[Notifications] Failed to check permission:', error);
        return false;
    }
}

/**
 * Cancel all pending scheduled notifications.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
    if (!isNativePlatform()) return;

    try {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel({
                notifications: pending.notifications.map(n => ({ id: n.id }))
            });
        }
    } catch (error) {
        console.error('[Notifications] Failed to cancel notifications:', error);
    }
}

/**
 * Cancel a specific notification by ID.
 */
export async function cancelNotification(id: number): Promise<void> {
    if (!isNativePlatform()) return;

    try {
        await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (error) {
        console.error(`[Notifications] Failed to cancel notification ${id}:`, error);
    }
}

/**
 * Get pending scheduled notifications.
 */
export async function getPendingNotifications(): Promise<PendingLocalNotificationSchema[]> {
    if (!isNativePlatform()) return [];

    try {
        const pending = await LocalNotifications.getPending();
        return pending.notifications;
    } catch (error) {
        console.error('[Notifications] Failed to get pending notifications:', error);
        return [];
    }
}

/**
 * Schedule the morning notification for 7 AM.
 */
export async function scheduleMorningNotification(tasksCount: number): Promise<void> {
    if (!isNativePlatform() || tasksCount === 0) return;

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
        console.warn('[Notifications] No permission to schedule notifications');
        return;
    }

    try {
        await cancelNotification(NOTIFICATION_IDS.MORNING_TASKS);

        const now = new Date();
        const scheduledTime = new Date();
        scheduledTime.setHours(7, 0, 0, 0);

        if (now.getHours() >= 7) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const options: ScheduleOptions = {
            notifications: [
                {
                    id: NOTIFICATION_IDS.MORNING_TASKS,
                    title: '🌅 Daily Business Update',
                    body: `Good morning! You have ${tasksCount} task${tasksCount !== 1 ? 's' : ''} to complete today.`,
                    schedule: {
                        at: scheduledTime,
                        allowWhileIdle: true,
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    actionTypeId: 'OPEN_INSIGHTS',
                    extra: { route: '/insights' }
                }
            ]
        };

        await LocalNotifications.schedule(options);
        console.log('[Notifications] Morning notification scheduled for:', scheduledTime);
    } catch (error) {
        console.error('[Notifications] Failed to schedule morning notification:', error);
    }
}

/**
 * Schedule the evening reminder notification for 9 PM.
 */
export async function scheduleEveningNotification(tasksCount: number): Promise<void> {
    if (!isNativePlatform() || tasksCount === 0) return;

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
        console.warn('[Notifications] No permission to schedule notifications');
        return;
    }

    try {
        await cancelNotification(NOTIFICATION_IDS.EVENING_REMINDER);

        const now = new Date();
        const scheduledTime = new Date();
        scheduledTime.setHours(21, 0, 0, 0);

        if (now.getHours() >= 21) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const options: ScheduleOptions = {
            notifications: [
                {
                    id: NOTIFICATION_IDS.EVENING_REMINDER,
                    title: '📝 Pending Tasks Reminder',
                    body: `You haven't completed your tasks yet. You have ${tasksCount} pending task${tasksCount !== 1 ? 's' : ''}.`,
                    schedule: {
                        at: scheduledTime,
                        allowWhileIdle: true,
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    actionTypeId: 'OPEN_INSIGHTS',
                    extra: { route: '/insights' }
                }
            ]
        };

        await LocalNotifications.schedule(options);
        console.log('[Notifications] Evening notification scheduled for:', scheduledTime);
    } catch (error) {
        console.error('[Notifications] Failed to schedule evening notification:', error);
    }
}

/**
 * Schedule the payment reminder notification for 6 AM.
 */
export async function schedulePaymentReminderNotification(count: number, totalAmount: number): Promise<void> {
    if (!isNativePlatform() || count === 0) return;

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
        console.warn('[Notifications] No permission to schedule notifications');
        return;
    }

    try {
        await cancelNotification(NOTIFICATION_IDS.PAYMENT_REMINDER);

        // TEST MODE: Schedule for 1 minute from now to test closed app behavior
        // const now = new Date();
        // const scheduledTime = new Date();
        // scheduledTime.setHours(6, 0, 0, 0);

        // if (now.getHours() >= 6) {
        //     scheduledTime.setDate(scheduledTime.getDate() + 1);
        // }

        const scheduledTime = new Date(Date.now() + 60 * 1000); // 1 minute from now

        const formattedAmount = totalAmount.toLocaleString('en-IN');

        const options: ScheduleOptions = {
            notifications: [
                {
                    id: NOTIFICATION_IDS.PAYMENT_REMINDER,
                    title: '🌅 Morning Collection Reminder',
                    body: `Good morning! You have ${count} payment${count !== 1 ? 's' : ''} to collect today (Total: ₹${formattedAmount}).`,
                    channelId: 'vishnu_business_reminders', // Required for Android 8+
                    schedule: {
                        at: scheduledTime,
                        allowWhileIdle: true,
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    actionTypeId: 'OPEN_HOME',
                    extra: { route: '/' }
                }
            ]
        };

        await LocalNotifications.schedule(options);
        console.log('[Notifications] Payment reminder scheduled for:', scheduledTime);
    } catch (error) {
        console.error('[Notifications] Failed to schedule payment reminder:', error);
    }
}

/**
 * Schedule the daily backup reminder notification for 7 AM.
 */
export async function scheduleBackupReminderNotification(): Promise<void> {
    if (!isNativePlatform()) return;

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
        console.warn('[Notifications] No permission to schedule backup reminder');
        return;
    }

    try {
        await cancelNotification(NOTIFICATION_IDS.BACKUP_REMINDER);

        const now = new Date();
        const scheduledTime = new Date();
        scheduledTime.setHours(7, 0, 0, 0);

        if (now.getHours() >= 7) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const options: ScheduleOptions = {
            notifications: [
                {
                    id: NOTIFICATION_IDS.BACKUP_REMINDER,
                    title: '☁️ Daily Backup Time',
                    body: 'Tap to open the app and backup your business data.',
                    schedule: {
                        at: scheduledTime,
                        allowWhileIdle: true,
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    actionTypeId: 'OPEN_BACKUP',
                    extra: { route: '/settings', action: 'backup' }
                }
            ]
        };

        await LocalNotifications.schedule(options);
        console.log('[Notifications] Backup reminder scheduled for:', scheduledTime);
    } catch (error) {
        console.error('[Notifications] Failed to schedule backup reminder:', error);
    }
}

/**
 * Show backup completed notification immediately.
 */
export async function showBackupCompletedNotification(): Promise<void> {
    if (!isNativePlatform()) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('✅ Backup Complete', {
                body: 'Your business data has been backed up to Google Drive.',
                icon: '/vite.svg'
            });
        }
        return;
    }

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) return;

    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: Math.floor(Math.random() * 100000) + 10000,
                    title: '✅ Backup Complete',
                    body: 'Your business data has been backed up to Google Drive.',
                    schedule: {
                        at: new Date(Date.now() + 500),
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                }
            ]
        });
        console.log('[Notifications] Backup completion notification sent');
    } catch (error) {
        console.error('[Notifications] Failed to show backup completion notification:', error);
    }
}

/**
 * Show backup failed notification.
 */
export async function showBackupFailedNotification(reason?: string): Promise<void> {
    if (!isNativePlatform()) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('❌ Backup Failed', {
                body: reason || 'Could not backup your data. Please try again.',
                icon: '/vite.svg'
            });
        }
        return;
    }

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) return;

    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: Math.floor(Math.random() * 100000) + 20000,
                    title: '❌ Backup Failed',
                    body: reason || 'Could not backup your data. Please try again.',
                    schedule: {
                        at: new Date(Date.now() + 500),
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    extra: { route: '/settings' }
                }
            ]
        });
    } catch (error) {
        console.error('[Notifications] Failed to show backup failed notification:', error);
    }
}

/**
 * Show an immediate notification (for testing or instant alerts).
 */
export async function showImmediateNotification(title: string, body: string, route?: string): Promise<void> {
    if (!isNativePlatform()) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, { body, icon: '/vite.svg' });
            if (route) {
                notification.onclick = () => {
                    window.focus();
                    window.location.href = route;
                };
            }
        }
        return;
    }

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) return;

    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: Math.floor(Math.random() * 100000),
                    title,
                    body,
                    schedule: {
                        at: new Date(Date.now() + 1000),
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    extra: route ? { route } : undefined
                }
            ]
        });
    } catch (error) {
        console.error('[Notifications] Failed to show immediate notification:', error);
    }
}

/**
 * Set up notification click listener.
 * Call this once when the app starts.
 */
export function setupNotificationClickListener(navigate: (path: string) => void): void {
    if (!isNativePlatform()) return;

    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        console.log('[Notifications] Notification clicked:', notification);

        const route = notification.notification.extra?.route;
        if (route) {
            setTimeout(() => {
                navigate(route);
            }, 100);
        }
    });
}

/**
 * Remove all notification listeners.
 * Call this when the app is unmounting.
 */
export async function removeAllNotificationListeners(): Promise<void> {
    if (!isNativePlatform()) return;

    await LocalNotifications.removeAllListeners();
}

/**
 * Show security alert notification when a new/unauthorized device logs in.
 */
export async function showSecurityAlertNotification(deviceName: string): Promise<void> {
    if (!isNativePlatform()) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('🚨 New Device Login', {
                body: `Login from a new device: ${deviceName}. Check Activity in Settings.`,
                icon: '/vite.svg'
            });
            notification.onclick = () => {
                window.focus();
                window.location.href = '/settings';
            };
        }
        return;
    }

    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) return;

    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: NOTIFICATION_IDS.SECURITY_ALERT,
                    title: '🚨 New Device Login',
                    body: `Login from a new device: ${deviceName}. Check Activity in Settings.`,
                    schedule: {
                        at: new Date(Date.now() + 500),
                    },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    largeIcon: 'ic_notification',
                    extra: { route: '/settings' }
                }
            ]
        });
        console.log('[Notifications] Security alert notification sent');
    } catch (error) {
        console.error('[Notifications] Failed to show security alert notification:', error);
    }
}
