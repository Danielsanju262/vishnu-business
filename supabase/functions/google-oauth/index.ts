// Supabase Edge Function for Google OAuth Token Management
// This function handles:
// 1. Exchanging authorization codes for access + refresh tokens
// 2. Refreshing access tokens using stored refresh tokens
// 3. Storing refresh tokens securely in the database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google OAuth endpoints
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, code, device_id, redirect_uri } = await req.json();

        // Get environment variables
        const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
        const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return new Response(
                JSON.stringify({ error: 'Google OAuth credentials not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create Supabase client with service role for database access
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

        // ACTION: Exchange authorization code for tokens
        if (action === 'exchange') {
            if (!code || !device_id || !redirect_uri) {
                return new Response(
                    JSON.stringify({ error: 'Missing required parameters: code, device_id, redirect_uri' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Exchange code for tokens
            const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    redirect_uri,
                    grant_type: 'authorization_code',
                }),
            });

            const tokenData = await tokenResponse.json();

            if (tokenData.error) {
                return new Response(
                    JSON.stringify({ error: tokenData.error_description || tokenData.error }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Store refresh token in database (encrypted in a real app)
            if (tokenData.refresh_token) {
                const { error: dbError } = await supabase
                    .from('google_oauth_tokens')
                    .upsert({
                        device_id,
                        refresh_token: tokenData.refresh_token,
                        access_token: tokenData.access_token,
                        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'device_id' });

                if (dbError) {
                    console.error('Database error:', dbError);
                }
            }

            return new Response(
                JSON.stringify({
                    access_token: tokenData.access_token,
                    expires_in: tokenData.expires_in,
                    token_type: tokenData.token_type,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ACTION: Refresh access token using stored refresh token
        if (action === 'refresh') {
            if (!device_id) {
                return new Response(
                    JSON.stringify({ error: 'Missing required parameter: device_id' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Get stored refresh token
            const { data: tokenRecord, error: fetchError } = await supabase
                .from('google_oauth_tokens')
                .select('refresh_token')
                .eq('device_id', device_id)
                .single();

            if (fetchError || !tokenRecord?.refresh_token) {
                return new Response(
                    JSON.stringify({ error: 'No refresh token found. Please reconnect.', needsReauth: true }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Refresh the access token
            const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    refresh_token: tokenRecord.refresh_token,
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                }),
            });

            const refreshData = await refreshResponse.json();

            if (refreshData.error) {
                // Refresh token may have been revoked
                if (refreshData.error === 'invalid_grant') {
                    // Clear invalid token from DB
                    await supabase
                        .from('google_oauth_tokens')
                        .delete()
                        .eq('device_id', device_id);

                    return new Response(
                        JSON.stringify({ error: 'Refresh token expired or revoked. Please reconnect.', needsReauth: true }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                return new Response(
                    JSON.stringify({ error: refreshData.error_description || refreshData.error }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Update stored access token
            await supabase
                .from('google_oauth_tokens')
                .update({
                    access_token: refreshData.access_token,
                    expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('device_id', device_id);

            return new Response(
                JSON.stringify({
                    access_token: refreshData.access_token,
                    expires_in: refreshData.expires_in,
                    token_type: refreshData.token_type,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ACTION: Revoke/disconnect
        if (action === 'revoke') {
            if (!device_id) {
                return new Response(
                    JSON.stringify({ error: 'Missing required parameter: device_id' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Delete stored tokens
            await supabase
                .from('google_oauth_tokens')
                .delete()
                .eq('device_id', device_id);

            return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action. Use: exchange, refresh, or revoke' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
