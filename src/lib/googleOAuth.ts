/**
 * Google OAuth Service
 * Handles token exchange and refresh via Supabase Edge Functions
 * This enables persistent authentication without token expiry issues
 */

// Generate a stable device ID for token storage
const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('vishnu_device_id');
    if (!deviceId) {
        // Generate a unique device ID
        deviceId = 'device_' + crypto.randomUUID();
        localStorage.setItem('vishnu_device_id', deviceId);
    }
    return deviceId;
};

// Get the Supabase function URL
const getEdgeFunctionUrl = (): string => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL not configured');
    }
    return `${supabaseUrl}/functions/v1/google-oauth`;
};

// Token storage keys
const TOKEN_KEY = 'vishnu_gdrive_token';
const TOKEN_EXPIRY_KEY = 'vishnu_gdrive_token_expiry';
const HAS_REFRESH_TOKEN_KEY = 'vishnu_gdrive_has_refresh';

export interface TokenResponse {
    access_token: string;
    expires_in: number;
    token_type?: string;
    error?: string;
    needsReauth?: boolean;
}

/**
 * Exchange an authorization code for tokens
 * The Edge Function will store the refresh token securely
 */
export const exchangeCodeForTokens = async (
    code: string,
    redirectUri: string
): Promise<TokenResponse> => {
    const response = await fetch(getEdgeFunctionUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'exchange',
            code,
            device_id: getDeviceId(),
            redirect_uri: redirectUri,
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    // Mark that we have a refresh token stored server-side
    localStorage.setItem(HAS_REFRESH_TOKEN_KEY, 'true');

    // Store access token locally for quick access
    storeAccessToken(data.access_token, data.expires_in);

    return data;
};

/**
 * Refresh the access token using the stored refresh token
 * Call this when the access token is expired or about to expire
 */
export const refreshAccessToken = async (): Promise<TokenResponse> => {
    const hasRefreshToken = localStorage.getItem(HAS_REFRESH_TOKEN_KEY);
    if (!hasRefreshToken) {
        return {
            access_token: '',
            expires_in: 0,
            error: 'No refresh token available',
            needsReauth: true
        };
    }

    const response = await fetch(getEdgeFunctionUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'refresh',
            device_id: getDeviceId(),
        }),
    });

    const data = await response.json();

    if (data.error) {
        if (data.needsReauth) {
            // Clear local storage since refresh token is invalid
            clearAllTokens();
        }
        throw new Error(data.error);
    }

    // Store new access token
    storeAccessToken(data.access_token, data.expires_in);

    return data;
};

/**
 * Revoke tokens and disconnect from Google Drive
 */
export const revokeTokens = async (): Promise<void> => {
    try {
        await fetch(getEdgeFunctionUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'revoke',
                device_id: getDeviceId(),
            }),
        });
    } catch (e) {
        console.error('Failed to revoke tokens:', e);
    }

    clearAllTokens();
};

/**
 * Store access token with expiry
 */
export const storeAccessToken = (accessToken: string, expiresIn: number): void => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    const expiryTimestamp = Date.now() + (expiresIn * 1000);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTimestamp.toString());
};

/**
 * Get the stored access token
 */
export const getStoredToken = (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
};

/**
 * Check if we have a valid (non-expired) access token
 */
export const isAccessTokenValid = (): boolean => {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!token || !expiryStr) return false;

    const expiry = parseInt(expiryStr, 10);
    // Consider token invalid if it expires within 5 minutes
    const bufferMs = 5 * 60 * 1000;
    return Date.now() < (expiry - bufferMs);
};

/**
 * Check if we have a refresh token stored (server-side)
 */
export const hasRefreshToken = (): boolean => {
    return localStorage.getItem(HAS_REFRESH_TOKEN_KEY) === 'true';
};

/**
 * Check if the token is expiring soon (within 10 minutes)
 */
export const isTokenExpiringSoon = (): boolean => {
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiryStr) return false;

    const expiry = parseInt(expiryStr, 10);
    const tenMinutesMs = 10 * 60 * 1000;
    return Date.now() > (expiry - tenMinutesMs) && Date.now() < expiry;
};

/**
 * Clear all token data
 */
export const clearAllTokens = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(HAS_REFRESH_TOKEN_KEY);
};

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function to use before API calls
 */
export const getValidAccessToken = async (): Promise<string | null> => {
    // If current token is valid, return it
    if (isAccessTokenValid()) {
        return getStoredToken();
    }

    // Try to refresh if we have a refresh token
    if (hasRefreshToken()) {
        try {
            const result = await refreshAccessToken();
            return result.access_token;
        } catch (e) {
            console.error('Token refresh failed:', e);
            return null;
        }
    }

    return null;
};
