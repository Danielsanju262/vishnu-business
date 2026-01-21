import { useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { exportData } from '../lib/backup';
import { uploadToDrive } from '../lib/drive';
import {
    hasRefreshToken,
    refreshAccessToken,
    getStoredToken,
    isAccessTokenValid
} from '../lib/googleOAuth';

// Device-specific key for tracking daily backup
const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('vishnu_device_id');
    if (!deviceId) {
        deviceId = 'device_' + crypto.randomUUID();
        localStorage.setItem('vishnu_device_id', deviceId);
    }
    return deviceId;
};

const LAST_BACKUP_KEY_PREFIX = 'vishnu_daily_backup_';

export function useAutoBackup() {
    const hasRunRef = useRef(false);

    const performDailyBackup = useCallback(async () => {
        // Prevent multiple runs in same session
        if (hasRunRef.current) return;
        hasRunRef.current = true;

        const deviceId = getDeviceId();
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lastBackupKey = `${LAST_BACKUP_KEY_PREFIX}${deviceId}`;
        const lastBackupDate = localStorage.getItem(lastBackupKey);

        // Skip if already backed up today for this device
        if (lastBackupDate === todayStr) {
            console.log('[AutoBackup] Already backed up today for this device, skipping');
            return;
        }

        // Check if Google Drive is connected (has refresh token)
        if (!hasRefreshToken()) {
            console.log('[AutoBackup] Google Drive not connected, skipping auto backup');
            return;
        }

        console.log('[AutoBackup] Starting daily auto backup...');

        try {
            // Get valid access token (refresh if needed)
            let token: string | null = null;

            if (isAccessTokenValid()) {
                token = getStoredToken();
            } else {
                // Try to refresh
                try {
                    const result = await refreshAccessToken();
                    token = result.access_token;
                } catch (e) {
                    console.error('[AutoBackup] Failed to refresh token:', e);
                    return;
                }
            }

            if (!token) {
                console.log('[AutoBackup] No valid token available');
                return;
            }

            // Export data
            const data = await exportData(() => { }); // Silent progress

            // Upload to Drive
            const fileName = `vishnu_backup_auto_${todayStr}_${deviceId.slice(-8)}.json`;
            await uploadToDrive(token, fileName, data);

            // Mark as done for today
            localStorage.setItem(lastBackupKey, todayStr);
            localStorage.setItem('vishnu_last_auto_backup', new Date().toDateString());

            console.log('[AutoBackup] Daily backup completed successfully');

        } catch (error) {
            console.error('[AutoBackup] Failed to perform daily backup:', error);
            // Don't mark as done, so it will retry next time
        }
    }, []);

    useEffect(() => {
        // Run backup check when app loads
        // Small delay to let auth and other initialization complete
        const timer = setTimeout(() => {
            performDailyBackup();
        }, 3000); // 3 second delay to let Google OAuth initialize

        return () => clearTimeout(timer);
    }, [performDailyBackup]);
}
