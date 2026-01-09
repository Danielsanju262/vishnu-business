# Vishnu Business - Sales & Expense Tracker

A modern business management application for tracking sales, expenses, customers, products, and payment reminders with real-time synchronization across all devices.

## Features

- 🧠 **Daily Insights** - AI-powered daily business assistant with tasks, insights, and chat
- 📊 **Dashboard** - View today's revenue and profit at a glance
- 💰 **Sales Management** - Record sales with customer and product selection
- 💸 **Expense Tracking** - Track business expenses with quick presets
- 👥 **Customer Management** - Manage your customer database
- 📦 **Product Management** - Track your product inventory
- 📋 **Reports** - Detailed profit & loss statements, customer analytics
- 🔔 **Payment Reminders** - Track pending payments with due date alerts
- 🔐 **Security** - Master PIN and fingerprint authentication
- 🔄 **Real-time Sync** - All changes sync instantly across devices

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: TailwindCSS
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime
- **AI**: Google Gemini API (free tier)
- **Authentication**: Custom PIN + WebAuthn (Fingerprint)

## Setup

### 1. Clone & Install

```bash
git clone <repository-url>
cd vishnu-business
npm install
```

### 2. Environment Setup

Create a `.env` file with your credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
```

**To get a free Gemini API key:**
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and add it to your `.env` file

### 3. Database Setup

Run the following SQL files in your Supabase SQL editor (in order):

1. `supabase_schema.sql` - Core tables (customers, products, transactions, expenses)
2. `master_pin_table.sql` - Authentication tables
3. `auth_schema_update.sql` - Device authorization
4. `payment_reminders_schema.sql` - Payment reminders & real-time setup

### 4. Enable Real-time Sync

**IMPORTANT**: For real-time sync to work across devices, you must enable Supabase Realtime for your tables:

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Replication**
3. Enable replication for these tables:
   - `customers`
   - `products`
   - `transactions`
   - `expenses`
   - `expense_presets`
   - `payment_reminders`

Or run this SQL:

```sql
alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table expense_presets;
alter publication supabase_realtime add table payment_reminders;
```

### 5. Run Development Server

```bash
npm run dev
```

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

## Real-time Sync

This application features real-time synchronization across all connected devices:

- **No Reload Required**: When any device makes changes (add/edit/delete), all other devices automatically see the updates
- **Live Indicators**: Payment Reminders page shows a "Live" indicator when connected to real-time
- **Optimistic Updates**: UI updates immediately while syncing in the background

### How It Works

The app uses Supabase Realtime with PostgreSQL LISTEN/NOTIFY:

1. Each page subscribes to relevant database tables
2. When data changes, Supabase broadcasts the event
3. All connected clients receive the event and refresh their data
4. Users see updates instantly without any action

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## License

Private - All rights reserved
