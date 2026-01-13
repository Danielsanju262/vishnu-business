# 🎯 QUICK TEST GUIDE - Goal System

## ⚠️ BEFORE TESTING:

### 1. Run Database Migration:
```sql
-- Open Supabase SQL Editor
-- Copy from: supabase/migrations/add_goal_tracking_fields.sql
-- Click "Run"
```

### 2. Hard Refresh:
```
Ctrl + Shift + R
```

---

## 🧪 TEST CASES:

### **Test 1: Create EMI Goal**
```
User: "Set a goal for bike EMI of 16000 by 20th"

Expected:
✅ Auto-detects as EMI type
✅ Shows "💳 EMI/Payment (Manual Allocation)"
✅ Suggests allocation commands
```

### **Test 2: Create Auto-Tracked Goal**
```
User: "Track 50000 profit this month"

Expected:
✅ Auto-detects as Net Profit
✅ Shows "🎯 Auto-Tracked"
✅ Progress updates from sales automatically
```

### **Test 3: List Goals**
```
User: "What are my goals?"

Expected:
✅ Shows all goals with icons
✅ Shows available surplus
✅ Shows daily targets
✅ Distinguishes EMI vs Auto
```

### **Test 4: Allocate to EMI**
```
User: "Allocate 5000 to bike EMI"

Expected:
✅ Asks for confirmation
✅ Shows before/after progress
✅ Updates on confirm
```

### **Test 5: Check Surplus**
```
User: "What's my surplus?"

Expected:
✅ Shows net profit this month
✅ Shows completed EMIs total
✅ Shows available surplus
```

### **Test 6: Customer Count Goal**
```
User: "Goal: 20 new customers by month end"

Expected:
✅ Creates customer_count goal
✅ Shows 👥 icon
✅ Auto-counts from sales
```

### **Test 7: Margin Goal**
```
User: "Track 40% margin this month"

Expected:
✅ Creates margin goal
✅ Shows % icon
✅ Auto-calculates percentage
```

### **Test 8: Manual EMI Update**
Go to dashboard → Update bike EMI progress manually → AI should READ it (not recalculate)

---

## ✅ KEY BEHAVIORS:

### EMI Goals:
- ✅ User can update manually in dashboard
- ✅ AI reads manual updates (never overwrites)
- ✅ AI can allocate via command
- ✅ progress = current_amount (as user set it)

### Auto Goals:
- ✅ Progress auto-calculates from sales
- ✅ Updates in real-time
- ✅ No manual progress updates needed
- ✅ AI motivates based on auto-calc

### All Goals:
- ✅ AI can update: title, deadline, target
- ✅ AI provides daily motivation
- ✅ Dashboard and AI stay in sync

---

## 🎯 QUICK COMMANDS:

```
# Create
"Set bike EMI 16000 by 20th"
"Track 50k revenue this month"
"Goal: 20 new customers"
"Track 40% margin"

# Check
"What are my goals?"
"Show my surplus"

# Manage
"Allocate 5000 to bike"
"Mark bike EMI complete"
"Add surplus to bike"
```

---

## 🚨 IF SOMETHING'S WRONG:

1. Check migration ran successfully
2. Hard refresh (Ctrl+Shift+R)
3. Check console for errors
4. Verify goal types match (EMI vs Auto)
