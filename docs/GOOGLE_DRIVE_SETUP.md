# Google Drive Permanent Connection Setup

This guide explains how to set up persistent Google Drive authentication so users don't need to reconnect every hour.

## Overview

The new implementation uses **OAuth 2.0 Authorization Code Flow** with **refresh tokens**, allowing:
- Users to stay connected indefinitely
- Automatic token refresh before expiry
- No manual reconnection needed

## Setup Steps

### 1. Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID (Web application)
5. **Add Authorized Redirect URIs**:
   - For development: `https://localhost:5173`
   - For production: `https://your-deployed-app-url.com`
   
6. **Important**: Note down your:
   - Client ID (you already have this as `VITE_GOOGLE_CLIENT_ID`)
   - Client Secret (needed for the Edge Function)

### 2. Run Database Migration

Execute the following SQL in your Supabase SQL Editor:

```sql
-- Create table to store Google OAuth refresh tokens
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT UNIQUE NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (tokens accessed only via Edge Functions)
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_device_id ON google_oauth_tokens(device_id);

-- Add comment
COMMENT ON TABLE google_oauth_tokens IS 'Stores Google OAuth refresh tokens for persistent Drive backup authentication';
```

### 3. Deploy Supabase Edge Function

1. **Install Supabase CLI** (if not installed):
   ```bash
   npm install -g supabase
   ```

2. **Link your project**:
   ```bash
   cd "c:\Users\danie\Code\Vishnu business"
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. **Set Edge Function secrets**:
   ```bash
   supabase secrets set GOOGLE_CLIENT_ID=your_google_client_id
   supabase secrets set GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

4. **Deploy the function**:
   ```bash
   supabase functions deploy google-oauth
   ```

### 4. Verify Setup

After deployment, test the Edge Function:

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth" \
  -H "Content-Type: application/json" \
  -d '{"action": "test"}'
```

You should receive a response like:
```json
{"error": "Invalid action. Use: exchange, refresh, or revoke"}
```

## How It Works

### User Flow

1. **First Connection**:
   - User clicks "Connect (Stay Signed In)"
   - Google OAuth consent screen appears (with "offline access" permission)
   - User approves
   - Authorization code is sent to Edge Function
   - Edge Function exchanges code for access token + refresh token
   - Refresh token is stored securely in Supabase database
   - Access token is stored locally for quick API calls

2. **Subsequent Use**:
   - App checks if access token is still valid
   - If expired, Edge Function uses refresh token to get new access token
   - User remains connected without any interaction

3. **Disconnect**:
   - User clicks "Disconnect"
   - Edge Function deletes stored refresh token
   - Local tokens are cleared

### Token Lifecycle

| Token Type | Storage | Duration | Refresh |
|------------|---------|----------|---------|
| Access Token | localStorage | ~1 hour | Auto-refreshed via Edge Function |
| Refresh Token | Supabase DB (encrypted) | Until revoked | Never expires* |

*Note: Refresh tokens can be revoked by the user in their Google Account settings.

## Fallback Mode

The implementation also supports "Quick Connect" for users who don't want to grant offline access:
- Uses the original implicit flow
- Token expires in 1 hour
- User sees a warning banner to upgrade to persistent connection

## Troubleshooting

### "Token exchange failed" error
- Verify your `GOOGLE_CLIENT_SECRET` is correct
- Ensure the redirect URI matches exactly (including https)
- Check Edge Function logs: `supabase functions logs google-oauth`

### "No refresh token found" error
- User may have connected with the old implicit flow
- Ask them to disconnect and reconnect with "Stay Signed In"

### Refresh token not being returned
- Google only returns refresh token on the **first authorization**
- If user previously authorized without offline access, they need to:
  1. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
  2. Remove access for "Vishnu Business"
  3. Reconnect in the app

## Security Notes

- Refresh tokens are stored in Supabase with RLS enabled
- Only the Edge Function (using service role) can access them
- Client never sees or stores the refresh token
- Each device has its own unique token (device_id based)
