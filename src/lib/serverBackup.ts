/**
 * Server Backup Service
 * Handles communication with the server-side scheduled backup system
 */

import { supabase } from './supabase';

// Get the device ID (same as used in OAuth)
const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('vishnu_device_id');
    if (!deviceId) {
        deviceId = 'device_' + crypto.randomUUID();
        localStorage.setItem('vishnu_device_id', deviceId);
    }
    return deviceId;
};

export interface BackupConfig {
    enabled: boolean;
    backup_time: string;
    last_backup_at: string | null;
}

export interface BackupHistoryItem {
    id: number;
    file_name: string | null;
    file_size: number | null;
    status: 'success' | 'failed' | 'pending';
    error_message: string | null;
    backup_type: 'scheduled' | 'manual' | 'auto';
    created_at: string;
}

/**
 * Get the current backup configuration for this device
 */
export async function getBackupConfig(): Promise<BackupConfig | null> {
    try {
        const { data, error } = await supabase
            .from('backup_config')
            .select('*')
            .eq('device_id', getDeviceId())
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            console.error('[ServerBackup] Error fetching config:', error);
            return null;
        }

        return data ? {
            enabled: data.enabled,
            backup_time: data.backup_time || '07:00:00',
            last_backup_at: data.last_backup_at
        } : null;
    } catch (e) {
        console.error('[ServerBackup] Exception:', e);
        return null;
    }
}

/**
 * Enable or disable server-side scheduled backup
 */
export async function setBackupEnabled(enabled: boolean): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('backup_config')
            .upsert({
                device_id: getDeviceId(),
                enabled,
                updated_at: new Date().toISOString()
            }, { onConflict: 'device_id' });

        if (error) {
            console.error('[ServerBackup] Error setting backup enabled:', error);
            return false;
        }

        return true;
    } catch (e) {
        console.error('[ServerBackup] Exception:', e);
        return false;
    }
}

/**
 * Get backup history for this device
 */
export async function getBackupHistory(limit: number = 10): Promise<BackupHistoryItem[]> {
    try {
        const { data, error } = await supabase
            .from('backup_history')
            .select('*')
            .eq('device_id', getDeviceId())
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[ServerBackup] Error fetching history:', error);
            return [];
        }

        return data || [];
    } catch (e) {
        console.error('[ServerBackup] Exception:', e);
        return [];
    }
}

/**
 * Trigger a manual server backup
 */
export async function triggerManualServerBackup(): Promise<{ success: boolean; message?: string }> {
    try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return { success: false, message: 'Supabase not configured' };
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/scheduled-backup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                device_id: getDeviceId(),
                manual: true
            })
        });

        const data = await response.json();

        if (response.ok) {
            return { success: true, message: data.message };
        } else {
            return { success: false, message: data.error || 'Backup failed' };
        }
    } catch (e) {
        console.error('[ServerBackup] Exception:', e);
        return { success: false, message: String(e) };
    }
}

/**
 * Get the last successful backup date
 */
export async function getLastBackupDate(): Promise<Date | null> {
    try {
        const { data, error } = await supabase
            .from('backup_history')
            .select('created_at')
            .eq('device_id', getDeviceId())
            .eq('status', 'success')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return null;
        }

        return new Date(data.created_at);
    } catch (e) {
        return null;
    }
}

/**
 * Check if server backup is available (user has connected Google Drive with refresh token)
 */
export async function isServerBackupAvailable(): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('google_oauth_tokens')
            .select('device_id')
            .eq('device_id', getDeviceId())
            .single();

        return !error && !!data;
    } catch (e) {
        return false;
    }
}
