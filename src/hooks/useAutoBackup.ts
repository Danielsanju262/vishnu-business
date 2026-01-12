import { useEffect, useRef } from 'react';
import { uploadToDrive } from '../lib/drive';
import { exportData } from '../lib/backup';
import { useToast } from '../components/toast-provider';
import {
    getValidAccessToken,
    hasRefreshToken,
    isAccessTokenValid
} from '../lib/googleOAuth';
import {
    isNativePlatform,
    scheduleBackupReminderNotification,
    showBackupCompletedNotification,
    showBackupFailedNotification
} from '../lib/nativeNotifications';

const BACKUP_CHECK_KEY = 'vishnu_last_auto_backup';
const TOKEN_KEY = 'vishnu_gdrive_token';
const TOKEN_EXPIRY_KEY = 'vishnu_gdrive_token_expiry';

// Legacy check for old users
const isLegacyTokenValid = (): boolean => {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!token || !expiryStr) return false;

    const expiry = parseInt(expiryStr, 10);
    const bufferMs = 5 * 60 * 1000;
    return Date.now() < (expiry - bufferMs);
};

export function useAutoBackup() {
    const { toast } = useToast();
    const hasScheduledReminder = useRef(false);

    useEffect(() => {
        const checkAndRunBackup = async () => {
            // 1. Check if backup is enabled
            const configStr = localStorage.getItem('vishnu_backup_config');
            if (!configStr) return;
            try {
                const config = JSON.parse(configStr);
                if (!config.enabled) return;
            } catch { return; }

            // 2. Schedule native notification reminder for next 7 AM (if not already scheduled)
            if (!hasScheduledReminder.current && isNativePlatform()) {
                await scheduleBackupReminderNotification();
                hasScheduledReminder.current = true;
            }

            // 3. Check time (>= 7 AM)
            const now = new Date();
            if (now.getHours() < 7) return;

            // 4. Check if already backed up today
            const lastBackupStr = localStorage.getItem(BACKUP_CHECK_KEY);
            const todayStr = now.toDateString();

            if (lastBackupStr === todayStr) return; // Already done today

            // 5. Get a valid access token (will auto-refresh if needed)
            let token: string | null = null;

            // Try the new refresh token flow first
            if (hasRefreshToken() || isAccessTokenValid()) {
                try {
                    token = await getValidAccessToken();
                } catch (e) {
                    console.log("Auto Backup: Could not get valid token via refresh flow", e);
                }
            }

            // Fallback to legacy token if available
            if (!token && isLegacyTokenValid()) {
                token = localStorage.getItem(TOKEN_KEY);
            }

            if (!token) {
                console.log("Auto Backup skipped: No valid token available. User needs to reconnect.");
                return;
            }

            // 6. Run Backup
            console.log("Starting Auto Backup...");
            try {
                // Generate Data
                const data = await exportData();

                // Upload
                const fileName = `vishnu_backup_AUTO_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                await uploadToDrive(token, fileName, data);

                // Success
                localStorage.setItem(BACKUP_CHECK_KEY, todayStr);

                // Show toast for in-app feedback
                toast("Daily backup complete ✓", "success");

                // Also show native notification (will appear in notification bar)
                await showBackupCompletedNotification();

                // Reschedule for tomorrow
                await scheduleBackupReminderNotification();

            } catch (error: any) {
                console.error("Auto Backup Failed", error);

                // If it's a token error, try to refresh and retry once
                const errorStr = String(error).toLowerCase();
                if ((errorStr.includes('401') || errorStr.includes('auth') || errorStr.includes('expired')) && hasRefreshToken()) {
                    console.log("Auto Backup: Token expired, attempting refresh...");
                    try {
                        const newToken = await getValidAccessToken();
                        if (newToken) {
                            const data = await exportData();
                            const fileName = `vishnu_backup_AUTO_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                            await uploadToDrive(newToken, fileName, data);
                            localStorage.setItem(BACKUP_CHECK_KEY, todayStr);
                            toast("Daily backup complete ✓", "success");
                            await showBackupCompletedNotification();
                            await scheduleBackupReminderNotification();
                        }
                    } catch (retryError) {
                        console.error("Auto Backup retry failed", retryError);
                        await showBackupFailedNotification("Token refresh failed. Please reconnect Google Drive.");
                    }
                } else {
                    // Show failure notification
                    await showBackupFailedNotification();
                }
            }
        };

        // Run check on mount
        checkAndRunBackup();

        // Also check periodically in case the app stays open past 7 AM
        const interval = setInterval(checkAndRunBackup, 30 * 60 * 1000); // Every 30 minutes

        return () => clearInterval(interval);
    }, [toast]);
}
