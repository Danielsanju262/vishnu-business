import { supabase } from "./supabase";

/**
 * Backup Logic
 * Fetches all critical data from Supabase and packages it into a JSON object.
 */
export const exportData = async (onProgress?: (progress: number) => void) => {
    onProgress?.(10);
    // 1. Fetch tables in parallel
    // We'll fetch them individually to track progress if needed, or just map the promise completion
    // Actually parallel is faster. Let's stick to parallel but maybe weigh the progress?
    // For simplicity with Promise.all, we can't easily track individual progress without a wrapper.
    // Let's wrap promises.

    const tables = [
        'customers', 'products', 'suppliers', 'expense_presets',
        'transactions', 'expenses', 'payment_reminders', 'accounts_payable', 'app_settings'
    ];

    let completed = 0;
    const updateProgress = () => {
        completed++;
        // 0-80% for fetching
        onProgress?.(10 + Math.round((completed / tables.length) * 70));
    };

    const fetchTable = async (table: string) => {
        const query = supabase.from(table).select('*');
        if (table !== 'app_settings') {
            query.is('deleted_at', null);
        }
        const { data } = await query;
        updateProgress();
        return data || [];
    };

    const results = await Promise.all(tables.map(fetchTable));

    onProgress?.(85);

    const [
        customers, products, suppliers, expense_presets,
        transactions, expenses, payment_reminders, accounts_payable, app_settings
    ] = results;

    const backup = {
        meta: {
            version: "1.1",
            date: new Date().toISOString(),
            app: "Vishnu Business"
        },
        data: {
            app_settings,
            customers,
            products,
            suppliers,
            expense_presets,
            transactions,
            expenses,
            payment_reminders,
            accounts_payable
        }
    };

    onProgress?.(90);
    return JSON.stringify(backup, null, 2);
};

export const getBackupStats = (jsonString: string) => {
    try {
        const backup = JSON.parse(jsonString);
        if (!backup.data) return null;
        return {
            customers: backup.data.customers?.length || 0,
            products: backup.data.products?.length || 0,
            suppliers: backup.data.suppliers?.length || 0,
            transactions: backup.data.transactions?.length || 0,
            expenses: backup.data.expenses?.length || 0,
            payment_reminders: backup.data.payment_reminders?.length || 0,
            accounts_payable: backup.data.accounts_payable?.length || 0,
            created_at: backup.meta?.date
        };
    } catch (e) {
        return null;
    }
};

export const getCurrentStats = async () => {
    const fetchCount = async (table: string) => {
        const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).is('deleted_at', null);
        return count || 0;
    };

    const [
        customers, products, suppliers,
        transactions, expenses, payment_reminders, accounts_payable
    ] = await Promise.all([
        fetchCount('customers'),
        fetchCount('products'),
        fetchCount('suppliers'),
        fetchCount('transactions'),
        fetchCount('expenses'),
        fetchCount('payment_reminders'),
        fetchCount('accounts_payable')
    ]);

    return {
        customers, products, suppliers,
        transactions, expenses, payment_reminders, accounts_payable
    };
};

/**
 * Restore Logic
 * Resets the database state to match the backup exactly.
 */

export const importData = async (jsonString: string, onProgress?: (progress: number) => void, excludedTables: string[] = []) => {
    onProgress?.(0);
    let backup;
    try {
        backup = JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Invalid backup file");
    }

    if (!backup.data) throw new Error("Invalid backup structure");

    const {
        app_settings,
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

    const steps = [
        { name: 'app_settings', data: app_settings, op: 'upsert' },
        { name: 'customers', data: customers, op: 'upsert' },
        { name: 'products', data: products, op: 'upsert' },
        { name: 'suppliers', data: suppliers, op: 'upsert' },
        { name: 'expense_presets', data: expense_presets, op: 'upsert' },
        { name: 'transactions', data: transactions, op: 'upsert' },
        { name: 'expenses', data: expenses, op: 'upsert' },
        { name: 'payment_reminders', data: payment_reminders, op: 'upsert' },
        { name: 'accounts_payable', data: accounts_payable, op: 'upsert' },
        // Prune phases
        { name: 'transactions', data: transactions, op: 'prune' },
        { name: 'expenses', data: expenses, op: 'prune' },
        { name: 'payment_reminders', data: payment_reminders, op: 'prune' },
        { name: 'accounts_payable', data: accounts_payable, op: 'prune' },
        { name: 'customers', data: customers, op: 'prune' },
        { name: 'products', data: products, op: 'prune' },
        { name: 'suppliers', data: suppliers, op: 'prune' },
        { name: 'expense_presets', data: expense_presets, op: 'prune' },
    ];

    // Filter out steps for excluded tables
    const activeSteps = steps.filter(step => !excludedTables.includes(step.name));

    const totalSteps = activeSteps.length;
    for (let i = 0; i < totalSteps; i++) {
        const step = activeSteps[i];
        if (step.op === 'upsert') {
            await upsertTable(step.name, step.data);
        } else {
            await pruneTable(step.name, step.data);
        }
        // Map 0-100%
        onProgress?.(Math.round(((i + 1) / totalSteps) * 100));
    }

    return true;
};

