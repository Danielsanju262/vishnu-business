import React, { Suspense, useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { supabase } from "./lib/supabase";

import Layout from "./components/Layout";
// Lazy load Insights pages to isolate errors
const Insights = React.lazy(() => import("./pages/Insights"));
const InsightsChat = React.lazy(() => import("./pages/InsightsChat"));
const BusinessInsights = React.lazy(() => import("./pages/BusinessInsights"));
const GoalsDashboard = React.lazy(() => import("./pages/GoalsDashboard"));
const AIMemorySettings = React.lazy(() => import("./pages/AIMemorySettings"));
const Brief = React.lazy(() => import("./pages/Brief"));
import Customers from "./pages/Customers";
import Products from "./pages/Products";
import Dashboard from "./pages/Dashboard";
import NewSale from "./pages/NewSale";
import NewExpense from "./pages/NewExpense";
import Reports from "./pages/Reports";
import PaymentReminders from "./pages/PaymentReminders";
import CustomerPaymentDetail from "./pages/CustomerPaymentDetail";
import Settings from "./pages/Settings";
import MasterPinSetup from "./pages/MasterPinSetup";
import AccountsPayable from "./pages/AccountsPayable";
import Suppliers from "./pages/Suppliers";
import SupplierPaymentDetail from "./pages/SupplierPaymentDetail";

import ScrollToTop from "./components/ScrollToTop";
import GoalBubbleWidget from "./components/Goals/GoalBubbleWidget";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LockScreen from "./components/LockScreen";
// Notifications disabled per user request
// import { useMorningNotifications } from "./hooks/useMorningNotifications";
// import { useNativeNotifications } from "./hooks/useNativeNotifications";

import { useDeepLinkBackHandler } from "./hooks/useDeepLinkBackHandler";
import { useAutoBackup } from "./hooks/useAutoBackup";
import { useRecurringReminders } from "./hooks/useRecurringReminders";

// Component to handle deep link back navigation (must be inside Router)
function DeepLinkBackHandler() {
  useDeepLinkBackHandler();
  return null;
}

function AppContent() {
  const { isLocked } = useAuth();
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Notifications disabled per user request
  // useMorningNotifications();
  // useNativeNotifications();

  // Initialize auto backup
  useAutoBackup();
  // Initialize recurring reminders check
  useRecurringReminders();

  useEffect(() => {
    checkDeviceAuth();
  }, []);

  const checkDeviceAuth = async () => {
    // Check if this device is already authorized
    const authorized = localStorage.getItem('device_authorized');

    if (authorized === 'true') {
      setIsDeviceAuthorized(true);
    } else {
      // Check if master PIN exists at all
      try {
        // Add timeout to prevent hanging if internet is slow/blocked
        const checkPin = supabase
          .from('app_settings')
          .select('master_pin')
          .eq('id', 1)
          .single();

        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );

        await Promise.race([checkPin, timeout]);

        // If no master PIN exists, this is first-time setup
        // If master PIN exists but device not authorized, need verification
        setIsDeviceAuthorized(false);
      } catch {
        // On error or timeout, default to unauthorized loop which handles setup/verification
        setIsDeviceAuthorized(false);
      }
    }
    setCheckingAuth(false);
  };

  // Show loading spinner while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show master PIN setup/verification if device not authorized
  if (!isDeviceAuthorized) {
    return <MasterPinSetup onSuccess={() => setIsDeviceAuthorized(true)} />;
  }

  return (
    <React.Fragment>
      <DeepLinkBackHandler />
      <ScrollToTop />
      {isLocked && <LockScreen />}
      {/* Global Goal Widget - appears on all pages */}
      {!isLocked && <GoalBubbleWidget />}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="insights" element={
            <Suspense fallback={<div className="p-10 text-center">Loading Insights...</div>}>
              <Insights />
            </Suspense>
          } />
          <Route path="insights/chat" element={
            <Suspense fallback={<div className="p-10 text-center">Loading Chat...</div>}>
              <InsightsChat />
            </Suspense>
          } />
          <Route path="insights/business" element={
            <Suspense fallback={<div className="p-10 text-center">Loading Business Insights...</div>}>
              <BusinessInsights />
            </Suspense>
          } />
          <Route path="insights/goals" element={
            <Suspense fallback={<div className="p-10 text-center">Loading Goals...</div>}>
              <GoalsDashboard />
            </Suspense>
          } />
          {/* Dashboard is now home, but keep this route for legacy links if any */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="reports" element={<Reports />} />
          <Route path="payment-reminders" element={<PaymentReminders />} />
          <Route path="payment-reminders/:customerId" element={<CustomerPaymentDetail />} />
          <Route path="accounts-payable" element={<AccountsPayable />} />
          <Route path="accounts-payable/:supplierId" element={<SupplierPaymentDetail />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/ai-memory" element={
            <Suspense fallback={<div className="p-10 text-center">Loading AI Settings...</div>}>
              <AIMemorySettings />
            </Suspense>
          } />
          <Route path="brief" element={
            <Suspense fallback={<div className="p-10 text-center">Loading Brief...</div>}>
              <Brief />
            </Suspense>
          } />
          <Route path="sale/new" element={<NewSale />} />
          <Route path="expense/new" element={<NewExpense />} />
        </Route>
      </Routes>
    </React.Fragment>
  );
}

function App() {
  /* 
  // TEMPORARILY DISABLED: Server Paused "Shock" Screen
  // Uncomment this block (and remove these block comments) to re-enable
  const [showShock, setShowShock] = useState(true);
  const [isFakeLoading, setIsFakeLoading] = useState(false);

  if (isFakeLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showShock) {
    return (
      <div className="min-h-screen bg-black/80 flex items-center justify-center p-4">
        <div className="bg-background max-w-md w-full rounded-2xl shadow-2xl overflow-hidden relative border border-border/50">
          <button 
            onClick={() => { setShowShock(false); setIsFakeLoading(true); }}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent transition-colors z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          
          <div className="p-8 text-center pt-12">
            <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            
            <h2 className="text-3xl font-bold mb-4 tracking-tight">Server Paused</h2>
            <p className="text-muted-foreground text-lg mb-8">
              The server has been paused due to inactivity.<br/><br/>
              <span className="font-semibold text-foreground">Upgrade your plan now</span>
            </p>
            
            <a 
              href="https://vercel.com/pricing" 
              className="flex w-full items-center justify-center rounded-xl bg-primary px-8 py-4 text-lg font-black text-primary-foreground border-4 border-foreground shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:bg-primary/90 transition-all transform hover:-translate-y-1 uppercase tracking-wider"
            >
              Upgrade Plan
            </a>
          </div>
        </div>
      </div>
    );
  }
  */

  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
