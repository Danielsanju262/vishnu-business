/**
 * Google Drive API Service
 * Handles uploading and listing backup files on Google Drive.
 */

// Scope required: https://www.googleapis.com/auth/drive.file
// We only need access to files created by this app, so 'drive.file' is perfect and safer.

const BOUNDARY = 'foo_bar_baz';
const DELIMITER = "\r\n--" + BOUNDARY + "\r\n";
const CLOSE_DELIM = "\r\n--" + BOUNDARY + "--";

export const uploadToDrive = async (accessToken: string, fileName: string, content: string) => {
    const metaData = {
        name: fileName,
        mimeType: 'application/json',
        // Optional: folder ID if we want to organize them
        // parents: ['folder_id'] 
    };

    const multipartRequestBody =
        DELIMITER +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metaData) +
        DELIMITER +
        'Content-Type: application/json\r\n\r\n' +
        content +
        CLOSE_DELIM;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${BOUNDARY}`
        },
        body: multipartRequestBody
    });

    if (!res.ok) {
        throw new Error('Upload failed: ' + res.statusText);
    }
    return res.json();
};

export const listBackups = async (accessToken: string) => {
    // Simplify query to avoid syntax errors. 
    // 'drive.file' scope ensures we only see files we created anyway.
    const params = new URLSearchParams({
        q: "trashed = false",
        orderBy: 'createdTime desc',
        pageSize: '10', // Fetch a few more to filter client side
        fields: 'files(id,name,createdTime,size)'
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!res.ok) {
        let errorMsg = res.statusText;
        try {
            const errBody = await res.json();
            if (errBody.error?.message) errorMsg = errBody.error.message;
        } catch (e) { }
        throw new Error(`List failed (${res.status}): ${errorMsg}`);
    }

    const data = await res.json();
    // Client-side filter to be safe
    const files = (data.files || []).filter((f: any) => f.name && f.name.includes('vishnu_backup_'));
    return { files };
};

export const downloadFile = async (accessToken: string, fileId: string) => {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!res.ok) {
        throw new Error('Download failed: ' + res.statusText);
    }
    return res.json();
};
