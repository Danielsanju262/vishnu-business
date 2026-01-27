import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/toast-provider';

export const useRecurringReminders = () => {
    const { toast } = useToast();
    const isProcessing = useRef(false);
    const lastProcessed = useRef<number>(0);
    const PROCESS_INTERVAL = 30 * 60 * 1000; // 30 minutes

    useEffect(() => {
        const processRecurringReminders = async () => {
            const now = Date.now();

            // Throttle processing to every 30 minutes
            if (isProcessing.current || (now - lastProcessed.current) < PROCESS_INTERVAL) {
                return;
            }

            isProcessing.current = true;
            lastProcessed.current = now;

            try {
                const nowDate = new Date();
                const nowIso = nowDate.toISOString();

                // 1. Fetch due configs
                const { data: configs, error } = await supabase
                    .from('recurring_reminder_configs')
                    .select('*')
                    .eq('is_active', true)
                    .lte('next_run_at', nowIso);

                if (error) {
                    console.error('Error fetching recurring configs:', error);
                    return;
                }

                if (!configs || configs.length === 0) return;

                let generatedCount = 0;

                // 2. Process each config
                for (const config of configs) {
                    // Create the reminder
                    // Note: We format the note to indicate it was auto-generated
                    const dateStr = nowDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const timeStr = nowDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                    const note = config.note
                        ? `${config.note}\n[Auto-Generated on ${dateStr} ${timeStr}]`
                        : `[Auto-Generated Recurring Reminder on ${dateStr} ${timeStr}]`;

                    const { error: insertError } = await supabase
                        .from('payment_reminders')
                        .insert({
                            customer_id: config.customer_id,
                            amount: config.amount,
                            due_date: nowIso.split('T')[0], // Due today
                            status: 'pending',
                            note: note
                        });

                    if (insertError) {
                        console.error('Failed to generate reminder for config', config.id, insertError);
                        continue;
                    }

                    // Calculate next run date
                    const nextRun = new Date(config.next_run_at); // Start from previous scheduled time to keep cadence

                    let newNextRun = new Date(nextRun);

                    // Logic to find next candidate that is > NOW
                    while (newNextRun <= nowDate) {
                        if (config.frequency === 'daily') {
                            newNextRun.setDate(newNextRun.getDate() + 1);
                        } else if (config.frequency === 'weekly') {
                            newNextRun.setDate(newNextRun.getDate() + 7);
                        } else if (config.frequency === 'monthly') {
                            newNextRun.setMonth(newNextRun.getMonth() + 1);
                        }
                    }

                    // Update the config
                    await supabase
                        .from('recurring_reminder_configs')
                        .update({
                            last_generated_at: nowIso,
                            next_run_at: newNextRun.toISOString()
                        })
                        .eq('id', config.id);

                    generatedCount++;
                }

                if (generatedCount > 0) {
                    toast(`${generatedCount} recurring reminders generated`, "success");
                    // Trigger a custom event so PaymentReminders page can reload if needed
                    window.dispatchEvent(new Event('payment-reminders-updated'));
                }

            } catch (err) {
                console.error('Error processing recurring reminders:', err);
            } finally {
                isProcessing.current = false;
            }
        };

        processRecurringReminders();
    }, []);
};
