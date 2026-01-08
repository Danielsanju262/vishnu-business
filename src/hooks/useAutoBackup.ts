import { useEffect, useRef } from 'react';
import { uploadToDrive } from '../lib/drive';
import { exportData } from '../lib/backup';
import { useToast } from '../components/toast-provider';

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useAutoBackup() {
    const { toast } = useToast();
    const hasAttempted = useRef(false);

    useEffect(() => {
        const checkAndBackup = async () => {
            if (hasAttempted.current) return;
            hasAttempted.current = true;

            const configStr = localStorage.getItem('vishnu_backup_config');
            if (!configStr) return;

            const config = JSON.parse(configStr);
            if (!config.enabled) return;

            const lastBackupStr = localStorage.getItem('vishnu_last_backup');
            const lastBackupTime = lastBackupStr ? new Date(lastBackupStr).getTime() : 0;
            const now = Date.now();

            if (now - lastBackupTime < BACKUP_INTERVAL_MS) {
                // Not due yet
                return;
            }

            const token = localStorage.getItem('vishnu_gdrive_token');
            if (!token) {
                // Configured but no token? Maybe show a silent warning or nothing.
                // toast("Auto-backup failed: Google Drive not connected", "error");
                return;
            }

            try {
                // Perform backup
                console.log("Starting auto-backup...");
                const data = await exportData();
                const fileName = `vishnu_backup_auto_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

                await uploadToDrive(token, fileName, data);

                // Update timestamp
                localStorage.setItem('vishnu_last_backup', new Date().toISOString());
                toast("Daily backup completed successfully", "success");
            } catch (e: any) {
                console.error("Auto-backup failed", e);
                if (String(e).includes('401') || String(e).includes('Unauthorized')) {
                    toast("Auto-backup failed: Google Drive session expired. Please reconnect in Settings.", "error");
                    localStorage.removeItem('vishnu_gdrive_token');
                } else {
                    // Silent fail for network issues to avoid annoying user on every load?
                    // Or show error logic? 
                    // Let's show filtered error.
                    // toast("Auto-backup failed (Network)", "error");
                }
            }
        };

        checkAndBackup();
    }, [toast]);
}
