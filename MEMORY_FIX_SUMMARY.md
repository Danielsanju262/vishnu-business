# AI Memory Delete & Update Fix

## Problem
The AI was executing memory DELETE and UPDATE operations **immediately without confirmation**, unlike CREATE operations which properly asked for user approval first. This caused:
- AI saying "okay" but changes not happening
- No visibility into what would be changed
- Inconsistent behavior between create/update/delete

## Root Cause
In `src/lib/enhancedAI.ts`:
- Lines 977-993: Delete and update tools were calling `toolDeleteMemory()` and `toolUpdateMemoryContent()` **immediately**
- No pending action was created
- No confirmation UI was shown

## Solution Applied

### 1. Updated PendingAction Interface
Added `'update_memory'` to supported action types:
```typescript
type: 'create_goal' | 'save_memory' | 'delete_goal' | 'delete_memory' | 'update_memory';
```

### 2. Added Update Memory Handler
In `executePendingAction()`, added case for `update_memory`:
```typescript
case 'update_memory': {
    const { searchText, newContent } = action.data;
    const result = await toolUpdateMemoryContent(searchText, newContent);
    return result;
}
```

### 3. Changed Delete Memory to Pending Action
Now when user says "forget about X":
1. AI finds the matching memory
2. Shows what will be deleted
3. Creates pending action requiring confirmation
4. Only deletes after user clicks "Confirm"

### 4. Changed Update Memory to Pending Action
Now when user says "change X to Y":
1. AI finds the matching memory
2. Shows BEFORE and AFTER
3. Creates pending action requiring confirmation
4. Only updates after user clicks "Confirm"

## User Experience Now

### Delete Flow:
```
User: "Forget about weekly summaries"
    ↓
AI: "I found this memory:
     🗑️ Memory to delete:
     'I prefer weekly summaries'
     
     ⚠️ This action requires your confirmation."
    ↓
User: Clicks "Confirm" ✅
    ↓
Memory deleted from database
Dashboard updates automatically
```

### Update Flow:
```
User: "Change my name to Daniel"
    ↓
AI: "I found this memory:
     ✏️ Current:
     'My name is Dan'
     
     ✨ New:
     'My name is Daniel'
     
     ⚠️ This action requires your confirmation."
    ↓
User: Clicks "Confirm" ✅
    ↓
Memory updated in database
Dashboard shows new value
```

## Testing Instructions

1. **Test Delete:**
   - Open AI chat
   - Say: "Remember that I like coffee"
   - Confirm the save
   - Say: "Forget about coffee"
   - You should see confirmation dialog
   - Click Confirm
   - Check Settings > AI Memory - should be gone

2. **Test Update:**
   - Say: "Remember that my name is John"
   - Confirm
   - Say: "Change my name to Daniel"
   - You should see before/after
   - Click Confirm
   - Check Settings > AI Memory - should show new name

3. **Test Not Found:**
   - Say: "Delete something that doesn't exist"
   - Should get error: "I couldn't find any memory..."

## Files Modified
- `src/lib/enhancedAI.ts`
  - Line 661: Added 'update_memory' to PendingAction type
  - Lines 700-705: Added update_memory case in executePendingAction
  - Lines 982-1012: Changed delete_memory to use pending action
  - Lines 1016-1050: Changed update_memory to use pending action

## Benefits
✅ Consistent behavior across all memory operations
✅ User sees exactly what will change before confirming
✅ Prevents accidental deletions/updates
✅ Clear feedback when memory not found
✅ All changes properly sync to dashboard
