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
import GlobalAIWidget from "./components/AI/GlobalAIWidget";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LockScreen from "./components/LockScreen";
// Notifications disabled per user request
// import { useMorningNotifications } from "./hooks/useMorningNotifications";
// import { useNativeNotifications } from "./hooks/useNativeNotifications";

import { useDeepLinkBackHandler } from "./hooks/useDeepLinkBackHandler";
import { useAutoBackup } from "./hooks/useAutoBackup";

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
      {/* Global AI Widget - appears on all pages */}
      {!isLocked && <GlobalAIWidget />}
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
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
