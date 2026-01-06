# Security & Authentication System

## Overview

This application implements a multi-layer security system with Master PIN and Super Admin PIN for comprehensive access control.

## Credential Types

### 1. Master PIN
- **Used by**: All users
- **Purpose**:
  - First-time login on a new device
  - Enabling biometric (fingerprint) authentication
  - Regular app unlocking
- **Restrictions**:
  - Cannot be changed without Super Admin PIN authorization
  - Must be verified on each new device before fingerprint can be enabled

### 2. Super Admin PIN
- **Used by**: Super Admin only
- **Purpose**:
  - Changing the Master PIN
  - Removing device fingerprint authorization
- **Security**:
  - Completely separate from Master PIN
  - Minimum 6 digits (recommended 8)
  - Should be stored securely and known only to the Super Admin

## User Stories Implemented

### US-01: First-Time Device Authentication
- New devices must authenticate with Master PIN
- Fingerprint option is hidden until Master PIN is verified
- Every device starts with Master PIN authentication

### US-02: Enable Fingerprint Authentication
- Fingerprint can only be enabled after Master PIN verification
- Clear blocking message shown if not yet verified
- WebAuthn/FIDO2 used for secure biometric storage

### US-03: Cross-Device Security Sync
- Security settings sync via Supabase
- Each device tracks its verified PIN version
- Fingerprint access requires matching PIN version

### US-04: Change Master PIN (Super Admin Only)
- Requires Super Admin PIN validation
- Cannot be done with Master PIN alone
- Clear error shown if Super Admin PIN is invalid

### US-05: Master PIN Change Forces Global Logout
- All devices are logged out immediately
- All biometric sessions are invalidated
- All devices must re-authenticate with new Master PIN

### US-06: View Fingerprint-Authorized Devices
- Device list shows:
  - Device name
  - Last active time
  - Fingerprint enabled status
  - Current device indicator
- Regular users can view but not remove devices

### US-07: Remove Device Fingerprint Authorization
- Requires Super Admin PIN (not Master PIN)
- Device is immediately logged out
- Fingerprint login disabled for that device

### US-08: Post-Removal Device Re-Authentication
- Removed devices must re-authenticate with Master PIN
- Can re-enable fingerprint after PIN verification

### US-09: Popup Visibility & Clarity
- All modals have solid opaque backgrounds (bg-black/95)
- Only one popup at a time
- Clear labels: "Enter Master PIN" vs "Enter Super Admin PIN"
- Critical security popups are non-dismissible during operations

## Database Schema

### app_settings table
```sql
id              INTEGER PRIMARY KEY
master_pin      TEXT
pin_version     INTEGER DEFAULT 1
super_admin_pin TEXT
super_admin_email TEXT
```

### authorized_devices table
```sql
id                      UUID PRIMARY KEY
device_id               TEXT UNIQUE
device_name             TEXT
fingerprint_enabled     BOOLEAN
verified_pin_version    INTEGER
last_pin_verified_at    TIMESTAMPTZ
last_active_at          TIMESTAMPTZ
created_at              TIMESTAMPTZ
```

## Setup Instructions

1. Run the SQL migrations in order:
   - `master_pin_table.sql`
   - `auth_schema_update.sql`
   - `super_admin_schema.sql`

2. On first app launch, create the Master PIN

3. Go to Settings > Configure Super Admin to set up the Super Admin PIN

4. Super Admin credentials should be securely stored by the designated administrator

## Security Best Practices

1. **Master PIN**: Use 4-6 digits, memorable but not obvious
2. **Super Admin PIN**: Use 6-8 digits, different from Master PIN
3. **Regular Review**: Periodically review authorized devices list
4. **Device Removal**: Remove fingerprint access for lost/compromised devices immediately
