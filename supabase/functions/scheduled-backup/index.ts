// Supabase Edge Function for Scheduled Google Drive Backup
// This function is triggered by pg_cron at 7 AM IST daily
// It performs automatic backup to Google Drive without user interaction

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

// Tables to backup
const BACKUP_TABLES = [
    'transactions',
    'customers',
    'products',
    'expenses',
    'payment_reminders',
    'suppliers',
    'accounts_payable'
];

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Get environment variables
        const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
        const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            console.error('Google OAuth credentials not configured');
            return new Response(
                JSON.stringify({ error: 'Google OAuth credentials not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create Supabase client with service role
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

        // Check if this is a manual trigger or scheduled
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            // Empty body is fine for cron triggers
        }

        const deviceId = body.device_id;
        const isManual = body.manual === true;

        console.log(`[Scheduled Backup] Starting backup. Manual: ${isManual}, Device: ${deviceId || 'all'}`);

        // Get all devices with backup enabled, or specific device if manual
        let query = supabase
            .from('google_oauth_tokens')
            .select('device_id, refresh_token');

        if (deviceId) {
            query = query.eq('device_id', deviceId);
        }

        const { data: tokens, error: tokenError } = await query;

        if (tokenError) {
            console.error('[Scheduled Backup] Error fetching tokens:', tokenError);
            return new Response(
                JSON.stringify({ error: 'Failed to fetch tokens' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!tokens || tokens.length === 0) {
            console.log('[Scheduled Backup] No devices found with refresh tokens');
            return new Response(
                JSON.stringify({ message: 'No devices configured for backup' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const results: any[] = [];

        // Process each device
        for (const tokenRecord of tokens) {
            const result = await processDeviceBackup(
                supabase,
                tokenRecord.device_id,
                tokenRecord.refresh_token,
                GOOGLE_CLIENT_ID,
                GOOGLE_CLIENT_SECRET
            );
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`[Scheduled Backup] Complete. Success: ${successCount}, Failed: ${failCount}`);

        return new Response(
            JSON.stringify({
                message: `Backup complete. ${successCount} succeeded, ${failCount} failed.`,
                results
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[Scheduled Backup] Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

async function processDeviceBackup(
    supabase: any,
    deviceId: string,
    refreshToken: string,
    clientId: string,
    clientSecret: string
): Promise<{ device_id: string; success: boolean; error?: string }> {
    try {
        console.log(`[Backup] Processing device: ${deviceId}`);

        // 1. Check backup configuration for this device
        const { data: config } = await supabase
            .from('backup_config')
            .select('enabled, last_backup_at')
            .eq('device_id', deviceId)
            .single();

        // Skip if backup not enabled
        if (config && !config.enabled) {
            console.log(`[Backup] Skipping ${deviceId} - backup disabled`);
            return { device_id: deviceId, success: true, error: 'Backup disabled' };
        }

        // Check if already backed up today
        if (config?.last_backup_at) {
            const lastBackup = new Date(config.last_backup_at);
            const today = new Date();
            if (lastBackup.toDateString() === today.toDateString()) {
                console.log(`[Backup] Skipping ${deviceId} - already backed up today`);
                return { device_id: deviceId, success: true, error: 'Already backed up today' };
            }
        }

        // 2. Refresh the access token
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
            }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error(`[Backup] Token refresh failed for ${deviceId}:`, tokenData.error);
            return { device_id: deviceId, success: false, error: `Token refresh failed: ${tokenData.error}` };
        }

        const accessToken = tokenData.access_token;

        // 3. Export all data
        const backupData = await exportAllData(supabase, deviceId);

        // 4. Upload to Google Drive
        const fileName = `vishnu_backup_SERVER_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const uploadSuccess = await uploadToGoogleDrive(accessToken, fileName, backupData);

        if (!uploadSuccess) {
            return { device_id: deviceId, success: false, error: 'Drive upload failed' };
        }

        // 5. Update last backup timestamp
        await supabase
            .from('backup_config')
            .upsert({
                device_id: deviceId,
                enabled: true,
                last_backup_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'device_id' });

        // 6. Record backup history
        await supabase
            .from('backup_history')
            .insert({
                device_id: deviceId,
                file_name: fileName,
                file_size: JSON.stringify(backupData).length,
                status: 'success',
                backup_type: 'scheduled',
                created_at: new Date().toISOString()
            });

        console.log(`[Backup] Success for device: ${deviceId}`);
        return { device_id: deviceId, success: true };

    } catch (error) {
        console.error(`[Backup] Error for device ${deviceId}:`, error);

        // Record failed backup
        await supabase
            .from('backup_history')
            .insert({
                device_id: deviceId,
                status: 'failed',
                error_message: String(error),
                backup_type: 'scheduled',
                created_at: new Date().toISOString()
            });

        return { device_id: deviceId, success: false, error: String(error) };
    }
}

async function exportAllData(supabase: any, deviceId: string): Promise<any> {
    const exportData: any = {
        version: '2.0',
        exported_at: new Date().toISOString(),
        device_id: deviceId,
        backup_type: 'server_scheduled',
        tables: {}
    };

    for (const table of BACKUP_TABLES) {
        try {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                exportData.tables[table] = data;
            } else {
                exportData.tables[table] = [];
                if (error) {
                    console.log(`[Export] Table ${table} error:`, error.message);
                }
            }
        } catch (e) {
            exportData.tables[table] = [];
            console.log(`[Export] Table ${table} exception:`, e);
        }
    }

    return exportData;
}

async function uploadToGoogleDrive(accessToken: string, fileName: string, data: any): Promise<boolean> {
    try {
        const metadata = {
            name: fileName,
            mimeType: 'application/json',
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

        // Use multipart upload
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelimiter = "\r\n--" + boundary + "--";

        const requestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(data, null, 2) +
            closeDelimiter;

        const response = await fetch(GOOGLE_DRIVE_UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary="${boundary}"`,
            },
            body: requestBody,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Upload] Drive upload failed:', response.status, errorText);
            return false;
        }

        const result = await response.json();
        console.log('[Upload] File uploaded successfully:', result.id);
        return true;

    } catch (error) {
        console.error('[Upload] Exception:', error);
        return false;
    }
}
