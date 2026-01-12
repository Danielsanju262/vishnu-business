# Vishnu Business

A comprehensive Business Management Solution built with React, Vite, and Supabase. This application is designed to manage sales, inventory, customers, suppliers, and business insights with a mobile-first approach.

## 🚀 Features

### core Functionality
-   **Point of Sale (POS)**: Fast and efficient billing interface for creating new sales.
-   **Inventory Management**: Track stock levels, manage products, and handle low stock alerts.
-   **Customer & Supplier Management**: Maintain detailed records of customers and suppliers, including transaction history and ledgers.
-   **Cash Flow & Ledger**: Track daily income, expenses, and overall business health with detailed ledger views.

### 🔒 Security & Authentication
-   **Multi-Level Access**: Master PIN for daily access and Super Admin PIN for critical settings.
-   **Biometric Authentication**: Support for FaceID and Fingerprint unlock (using WebAuthn/native capabilities).
-   **Device Authorization**: Strict device management system where only authorized devices can access the app.
-   **Security Alerts**: Real-time notifications for unauthorized login attempts.
-   **Lockout & Recovery**: Progressive lockout mechanism for failed PIN attempts.

### 📊 Business Intelligence
-   **Interactive Dashboard**: Real-time overview of daily sales, profit, and key metrics.
-   **Reports & Analytics**: Detailed reports on sales, expenses, and customer performance.
-   **Business Insights**: AI-powered or rule-based insights to help decision-making.

### 🛠 Technical Highlights
-   **Cross-Platform**: Built as a Progressive Web App (PWA) with Capacitor support for native Android/iOS builds.
-   **Offline-First**: Robust offline capabilities ensuring business continuity even without internet.
-   **Cloud Backup**: Integrated Google Drive backup and restore functionality.
-   **Real-time Sync**: Uses Supabase Realtime for instant data updates across devices.
-   **Native Notifications**: Local notifications for daily tasks, payment reminders, and security alerts.

## 🛠️ Tech Stack

-   **Frontend**: React 18+, TypeScript, Vite
-   **Styling**: Tailwind CSS, Lucide React (Icons)
-   **Backend / Database**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
-   **Mobile Runtime**: Capacitor (for Android & iOS)
-   **State Management**: React Context + Hooks
-   **PWA**: vite-plugin-pwa

## 🏁 Getting Started

### Prerequisites
-   Node.js (Latest LTS recommended)
-   npm or pnpm
-   Supabase Account

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Danielsanju262/vishnu-business.git
    cd vishnu-business
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_GOOGLE_CLIENT_ID=your_google_client_id
    ```

4.  **Run Development Server**
    ```bash
    npm run dev
    ```

### Building for Production

To build the web application:
```bash
npm run build
```

### Mobile Development (Capacitor)

To sync and open Android/iOS projects:
```bash
# Sync Capacitor config
npm run cap:sync

# Open Android Studio
npm run cap:android

# Open Xcode (Mac only)
npm run cap:ios
```

## 🗄️ Database Schema

The project uses Supabase (PostgreSQL). Key tables include:
-   `customers`, `suppliers`, `products`: Core entity data.
-   `transactions`, `expenses`: Financial records.
-   `app_settings`: Global application configurations.
-   `authorized_devices`: Device management for security.
-   `login_activity`: Security logs.

*(Ensure you have the necessary migrations applied from the `supabase/migrations` folder)*

## 🤝 Contributing

1.  Fork the repository
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

This project is proprietary software. All rights reserved.
