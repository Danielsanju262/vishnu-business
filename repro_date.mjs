
import { format, startOfMonth } from 'date-fns';

// Mock implementation of helper functions
function getRecurringPeriodStart(date, recurrenceType) {
    switch (recurrenceType) {
        case 'daily': {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }
        case 'weekly': {
            const d = new Date(date);
            const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
            const diff = day === 0 ? 6 : day - 1; // distance from Monday
            d.setDate(d.getDate() - diff);
            return d;
        }
        case 'monthly': {
            return new Date(date.getFullYear(), date.getMonth(), 1);
        }
        case 'yearly': {
            return new Date(date.getFullYear(), 0, 1);
        }
    }
}

function getRecurringPeriodEnd(date, recurrenceType) {
    switch (recurrenceType) {
        case 'daily': {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }
        case 'weekly': { // simplified
            const start = getRecurringPeriodStart(date, 'weekly');
            const end = new Date(start);
            end.setDate(end.getDate() + 6); // Monday + 6 = Sunday
            return end;
        }
        case 'monthly': {
            return new Date(date.getFullYear(), date.getMonth() + 1, 0); // last day of current month
        }
        case 'yearly': {
            return new Date(date.getFullYear(), 11, 31);
        }
    }
}

// Simulation of GoalsDashboard logic
const today = new Date();
console.log('Today (Local):', today.toString());
console.log('Today (ISO):', today.toISOString());

// 1. Initial State
let formStartDate = today.toISOString().split('T')[0];
console.log('Initial formStartDate:', formStartDate);

// 2. User selects Monthly Recurring
// useEffect logic
const formRecurrenceType = 'monthly';
const startOfMonthDate = startOfMonth(today);
formStartDate = format(startOfMonthDate, 'yyyy-MM-dd');
console.log('After Monthly select, formStartDate:', formStartDate);

// 3. Save Goal logic
const startDateObj = new Date(formStartDate);
console.log('startDateObj (from formStartDate):', startDateObj.toString());

const periodStart = getRecurringPeriodStart(startDateObj, formRecurrenceType);
const periodEnd = getRecurringPeriodEnd(startDateObj, formRecurrenceType);

const finalStartDate = periodStart.toISOString().split('T')[0];
const finalDeadline = periodEnd.toISOString().split('T')[0];

console.log('Calculated periodStart (Local):', periodStart.toString());
console.log('Calculated periodEnd (Local):', periodEnd.toString());
console.log('Final Start Date (ISO split):', finalStartDate);
console.log('Final Deadline (ISO split):', finalDeadline);

// Check if overdue
const todayISO = today.toISOString().split('T')[0];
console.log('Today ISO:', todayISO);
console.log('Is Overdue (deadline < today)?', finalDeadline < todayISO);
