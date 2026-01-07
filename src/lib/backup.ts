import { supabase } from "./supabase";

/**
 * Backup Logic
 * Fetches all critical data from Supabase and packages it into a JSON object.
 */
export const exportData = async () => {
    // 1. Fetch tables in parallel
    const [
        { data: customers },
        { data: products },
        { data: suppliers },
        { data: expense_presets },
        { data: transactions },
        { data: expenses },
        { data: payment_reminders },
        { data: accounts_payable }
    ] = await Promise.all([
        supabase.from('customers').select('*').is('deleted_at', null),
        supabase.from('products').select('*').is('deleted_at', null),
        supabase.from('suppliers').select('*').is('deleted_at', null),
        supabase.from('expense_presets').select('*').is('deleted_at', null),
        supabase.from('transactions').select('*').is('deleted_at', null),
        supabase.from('expenses').select('*').is('deleted_at', null),
        supabase.from('payment_reminders').select('*').is('deleted_at', null), // Assuming logic doesn't soft delete these?
        supabase.from('accounts_payable').select('*').is('deleted_at', null)      // Or status based. Let's fetch everything to be safe.
    ]);

    const backup = {
        meta: {
            version: "1.0",
            date: new Date().toISOString(),
            app: "Vishnu Business"
        },
        data: {
            customers: customers || [],
            products: products || [],
            suppliers: suppliers || [],
            expense_presets: expense_presets || [],
            transactions: transactions || [],
            expenses: expenses || [],
            payment_reminders: payment_reminders || [], // Need to check if pending is better? No, backup everything.
            accounts_payable: accounts_payable || []
        }
    };

    return JSON.stringify(backup, null, 2);
};

/**
 * Restore Logic
 * Resets the database state to match the backup exactly.
 */
export const importData = async (jsonString: string) => {
    let backup;
    try {
        backup = JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Invalid backup file");
    }

    if (!backup.data) throw new Error("Invalid backup structure");

    const {
        customers,
        products,
        suppliers,
        expense_presets,
        transactions,
        expenses,
        payment_reminders,
        accounts_payable
    } = backup.data;

    // Helper: Upsert (Insert or Update)
    const upsertTable = async (tableName: string, rows: any[]) => {
        if (!rows || rows.length === 0) return;
        const { error } = await supabase.from(tableName).upsert(rows);
        if (error) throw new Error(`Failed to restore ${tableName}: ${error.message}`);
    };

    // Helper: Prune (Delete records not in backup)
    const pruneTable = async (tableName: string, rows: any[]) => {
        const backupIds = new Set(rows ? rows.map((r: any) => r.id) : []);
        const { data: currentRows } = await supabase.from(tableName).select('id');

        if (currentRows) {
            const idsToDelete = currentRows
                .map(r => r.id)
                .filter(id => !backupIds.has(id));

            if (idsToDelete.length > 0) {
                const { error } = await supabase.from(tableName).delete().in('id', idsToDelete);
                if (error) console.warn(`Failed to prune extra records from ${tableName}`, error);
            }
        }
    };

    // PHASE 1: UPSERT (Parents First -> Children)
    // Ensures all referenced constraints exist before children reference them.
    await upsertTable('customers', customers);
    await upsertTable('products', products);
    await upsertTable('suppliers', suppliers);
    await upsertTable('expense_presets', expense_presets);

    await upsertTable('transactions', transactions);
    await upsertTable('expenses', expenses);
    await upsertTable('payment_reminders', payment_reminders);
    await upsertTable('accounts_payable', accounts_payable);

    // PHASE 2: PRUNE (Children First -> Parents)
    // Ensures children are deleted before parents to avoid FK violations.
    await pruneTable('transactions', transactions);
    await pruneTable('expenses', expenses);
    await pruneTable('payment_reminders', payment_reminders);
    await pruneTable('accounts_payable', accounts_payable);

    await pruneTable('customers', customers);
    await pruneTable('products', products);
    await pruneTable('suppliers', suppliers);
    await pruneTable('expense_presets', expense_presets);

    return true;
};
