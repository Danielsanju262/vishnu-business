# Goal Update Verification Guide

## 1. Title/Name Updates
**Patterns:**
- "Rename goal to 'New Savings'"
- "Change title to 'Vacation Fund'"
- "Call it 'Emergency Stash'"
- "New name: 'Business Growth'"

**Expected:**
- Detect `newTitle`.
- Show "🏷️ Rename to: ..." in confirmation.

## 2. Amount Updates (Increase/Reduce/Set)
**Patterns:**
- "Increase by 5000" (addAmount)
- "Add 2k to goal" (addAmount)
- "Reduce by 1000" (reduceAmount)
- "Decrease progress by 500" (reduceAmount)
- "Set target to 1 lakh" (targetAmount)
- "Make target 50k" (targetAmount)
- "Current progress is 20000" (currentAmount)

**Expected:**
- Detect appropriate field (`addAmount`, `reduceAmount`, `targetAmount`, `currentAmount`).
- Handle units (k, L, Lakh).
- Show correct emoji/description in confirmation.

## 3. Date Updates (Deadline & Start)
**Patterns:**
- "Deadline Jan 20"
- "Due next week"
- "End date March 15th"
- "Start tracking from today"
- "Begin from 1st April"

**Expected:**
- Detect `deadline` or `startDate`.
- Parse relative dates ("next week") correctly.
- Do not confuse start date with deadline.

## 4. Recurrence
**Patterns:**
- "Make it monthly"
- "Weekly goal"
- "Stop recurring"

**Expected:**
- Update `isRecurring` and `recurrenceType`.

## 5. Auto-Selection
- If only 1 goal exists, saying "Increase by 500" should automatically select it without asking for the name.
