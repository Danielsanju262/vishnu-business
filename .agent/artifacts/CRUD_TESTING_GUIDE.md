# AI CRUD Testing Guide - Quick Reference

## Test These Phrases to Verify UPDATE & DELETE Work Correctly

### 🎯 GOAL OPERATIONS

#### UPDATE a Goal
Try these phrases:
- "Update my savings goal to 50000"
- "Change the deadline for bike EMI to Jan 20"
- "Increase my profit goal target"
- "Edit savings goal target to 100000"
- "Adjust my goal deadline"

**Expected Result:**
```
I'll update the goal "Savings" with:
• Target: ₹50,000

👆 **Click the Confirm button above to save these changes**, or Decline to cancel.
```

#### DELETE a Goal
Try these phrases:
- "Delete my old goal"
- "Remove the savings goal"
- "Cancel bike EMI goal"
- "Erase my profit target"
- "Get rid of the monthly goal"

**Expected Result:**
```
I'll delete the goal "Old Goal".

👆 **Click the Confirm button above to permanently delete this goal**, or Decline to cancel.
```

---

### 🧠 MEMORY OPERATIONS

#### UPDATE a Memory
Try these phrases:
- "Update my name to Daniel"
- "Change what you know about my preference to evening updates"
- "Modify my coffee preference to cappuccino"
- "Actually my name is John"
- "Correct that - I prefer tea"

**Expected Result:**
```
I found this memory:

✏️ **Current:**
"User prefers morning meetings"

✨ **New:**
"User prefers evening updates"

👆 **Click the Confirm button above to save this update**, or Decline to cancel.
```

#### DELETE a Memory
Try these phrases:
- "Forget about my coffee preference"
- "Delete the memory about meetings"
- "Remove the fact about my name"
- "Stop remembering my old address"
- "Erase my preference for emails"

**Expected Result:**
```
I found this memory:

🗑️ **Memory to delete:**
"User prefers coffee in the morning"

👆 **Click the Confirm button above to permanently delete this**, or Decline to cancel.
```

---

## 🔍 WHAT TO VERIFY

For each test:

1. ✅ AI understands the request (doesn't ask for clarification)
2. ✅ AI creates a pending confirmation
3. ✅ You see **Confirm** and **Decline** buttons
4. ✅ Message includes 👆 emoji
5. ✅ Message says "Click the Confirm button above"
6. ✅ After clicking Confirm, action executes
7. ✅ AI confirms the action was completed

---

## 🎯 EDGE CASES TO TEST

### Multiple Goals with Similar Names
- If you have "Savings Goal" and "Emergency Savings"
- Try: "Update savings goal"
- AI should find the best match

### Vague Requests
- Try: "Change my goal"
- AI should ask: "Which goal would you like to update?"

### No Matching Item
- Try: "Delete non-existent goal"
- AI should say: "No goal found matching 'non-existent'"

---

## 🐛 IF SOMETHING DOESN'T WORK

### Symptom: AI doesn't understand UPDATE/DELETE
**Check:** Detection patterns might need adjustment
**File:** `src/lib/enhancedAI.ts` line 1096-1187

### Symptom: No Confirm button appears
**Check:** pendingAction might not be set correctly
**File:** `src/lib/enhancedAI.ts` check tool execution sections

### Symptom: Confirm button doesn't work
**Check:** GlobalAIWidget confirmation handlers
**File:** `src/components/AI/GlobalAIWidget.tsx` line 718-761

---

## 📊 COMPLETE TESTING MATRIX

| Operation | Goals | Memories | Status |
|-----------|-------|----------|--------|
| CREATE    | ✅    | ✅       | Working |
| READ      | ✅    | ✅       | Working |
| UPDATE    | ✅    | ✅       | **FIXED** |
| DELETE    | ✅    | ✅       | **FIXED** |

---

**Last Updated:** January 13, 2026  
**Status:** Ready for testing
