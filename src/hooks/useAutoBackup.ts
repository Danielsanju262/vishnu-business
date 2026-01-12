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

    // Auto backup logic disabled as per user request (removed feature)
    /*
    const checkAndRunBackup = async () => {
        // ... (previous logic removed/disabled)
    };
    checkAndRunBackup();
    */
}
