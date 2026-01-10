import { useEffect } from 'react';
import { uploadToDrive } from '../lib/drive';
import { exportData } from '../lib/backup';
import { useToast } from '../components/toast-provider';

const BACKUP_CHECK_KEY = 'vishnu_last_auto_backup';

export function useAutoBackup() {
    const { toast } = useToast();

    useEffect(() => {
        const checkAndRunBackup = async () => {
            // 1. Check if backup is enabled
            const configStr = localStorage.getItem('vishnu_backup_config');
            if (!configStr) return;
            try {
                const config = JSON.parse(configStr);
                if (!config.enabled) return;
            } catch { return; }

            // 2. Check if token exists
            const token = localStorage.getItem('vishnu_gdrive_token');
            if (!token) return;

            // 3. Check time (>= 7 AM)
            const now = new Date();
            if (now.getHours() < 7) return;

            // 4. Check if already backed up today
            const lastBackupStr = localStorage.getItem(BACKUP_CHECK_KEY);
            const todayStr = now.toDateString(); // "Fri Jan 10 2026"

            if (lastBackupStr === todayStr) return; // Already done today

            // 5. Run Backup
            console.log("Starting Auto Backup...");
            try {
                // Generate Data
                const data = await exportData();

                // Upload
                const fileName = `vishnu_backup_AUTO_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                await uploadToDrive(token, fileName, data);

                // Success
                localStorage.setItem(BACKUP_CHECK_KEY, todayStr);
                toast("Daily backup complete ✓", "success");
            } catch (error) {
                console.error("Auto Backup Failed", error);
                // Don't toast on error to avoid annoying user if background sync fails
            }
        };

        // Run check on mount
        checkAndRunBackup();

        // Optional: Check every hour if the app stays open? 
        // For now, simpler is better. Run on load/refresh.
    }, []);
}
