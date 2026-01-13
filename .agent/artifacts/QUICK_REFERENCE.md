# 🚀 AI Goal System - Quick Reference

## 📝 COMMANDS YOU CAN USE RIGHT NOW

### Create Goals
```
"Set a goal for bike EMI of 16000 by 20th"
"Create rent payment goal of 15000"
"Track 50k profit this month"
```

### View Goals
```
"What are my goals?"
"Show all my goals"
"List my goals"
```

### Check Available Money
```
"What's my surplus?"
"How much can I allocate?"
"Show available money"
```

### Allocate Funds
```
"Allocate 5000 to bike EMI"
"Put 10k towards rent"
"Use surplus for car loan"
```

### Date-Based Tracking
```
"Start tracking from 21st"
"Track bike EMI from January 25th"
```
→ AI will ask: "Use surplus or start fresh?"

### Add Surplus Later
```
"Add surplus to bike EMI"
"Include previous surplus for rent"
```

### Complete Goals
```
"Mark bike EMI complete"
"Finish rent payment"
"Complete savings goal"
```

---

## 🔥 WHAT HAPPENS

### When You Create an EMI Goal:
1. AI detects keywords (EMI, payment, bill, loan, rent)
2. Automatically sets as "Manual Allocation" type
3. Shows helpful tips
4. Ready for allocation

### When You Allocate:
1. AI shows confirmation with before/after
2. You approve or decline
3. Progress updates instantly
4. Dashboard refreshes

### When You Set Tracking Date:
1. AI parses the date
2. Shows available surplus
3. Asks for your preference:
   - Include surplus (existing + future)
   - Start fresh (only future)
4. Calculates progress automatically

### When You Complete:
1. AI asks for confirmation
2. Sets completion timestamp
3. Moves to "Completed" section
4. Surplus recalculates (excluding this EMI)

---

## 🎯 GOAL TYPES

### 💳 EMI/Payment Goals (Manual Allocation)
- **Keywords:** EMI, payment, bill, loan, rent, installment
- **Progress:** Based on manual allocations
- **Use Case:** Fixed payments you need to track

### 🎯 Auto-Tracked Goals (Sales Data)
- **Keywords:** profit, revenue, sales, earn
- **Progress:** Auto-calculated from transactions
- **Use Case:** Business targets

---

## 💡 PRO TIPS

1. **Be Specific with Goal Names:**
   - ✅ "bike EMI" - Easy to remember
   - ❌ "payment" - Too vague

2. **Use Natural Language:**
   - ✅ "Allocate 5k to bike EMI"
   - ✅ "Put 5000 towards bike EMI"
   - Both work!

3. **Check Surplus First:**
   ```
   "What's my surplus?"
   ```
   Then allocate with confidence!

4. **Track from Future Dates:**
   ```
   "Track from 21st"
   ```
   Great for upcoming EMIs!

5. **Flexible Surplus Addition:**
   - Start with "fresh"
   - Add surplus later when you want

---

## 🗄️ NEXT STEP: RUN MIGRATION

**Before testing, run the database migration:**

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste from: `supabase/migrations/add_goal_tracking_fields.sql`
4. Click "Run"

**OR use Supabase CLI:**
```bash
supabase db push
```

---

## ✅ TEST CHECKLIST

- [ ] Run database migration
- [ ] Refresh browser (Ctrl+Shift+R)
- [ ] Try: "Set a goal for bike EMI of 16000 by 20th"
- [ ] Check: "What are my goals?"
- [ ] Try: "What's my surplus?"
- [ ] Try: "Allocate 5000 to bike EMI"
- [ ] Try: "Start tracking from 21st"
- [ ] Try: "Add surplus to bike EMI"

---

**ALL FEATURES READY!** 🎉
