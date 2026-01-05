# 🛡️ Data Safety Upgrade

To ensure you **never lose data**, we have implemented a "Soft Delete" system.
When you "delete" an item, it is now simply hidden from the view but remains in the database safely.

## ⚠️ CRITICAL ACTION REQUIRED

You must run the `safeguards.sql` script in your Supabase SQL Editor to enable this protection for Transactions and Expenses.

1.  Open your **Supabase Dashboard**.
2.  Go to the **SQL Editor**.
3.  Copy the contents of `safeguards.sql`.
4.  Paste and **Run** the script.

**Note:** The system will use existing `is_active` flags for Customers and Products immediately.
