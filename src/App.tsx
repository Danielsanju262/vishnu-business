import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { supabase } from "./lib/supabase";

import Layout from "./components/Layout";
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
import { AuthProvider, useAuth } from "./context/AuthContext";
import LockScreen from "./components/LockScreen";

function AppContent() {
  const { isLocked } = useAuth();
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

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
        await supabase
          .from('app_settings')
          .select('master_pin')
          .eq('id', 1)
          .single();

        // If no master PIN exists, this is first-time setup
        // If master PIN exists but device not authorized, need verification
        setIsDeviceAuthorized(false);
      } catch {
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
    <Router>
      <ScrollToTop />
      {isLocked && <LockScreen />}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="reports" element={<Reports />} />
          <Route path="payment-reminders" element={<PaymentReminders />} />
          <Route path="payment-reminders/:customerId" element={<CustomerPaymentDetail />} />
          <Route path="accounts-payable" element={<AccountsPayable />} />
          <Route path="accounts-payable/:supplierId" element={<SupplierPaymentDetail />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="settings" element={<Settings />} />
          <Route path="sale/new" element={<NewSale />} />
          <Route path="expense/new" element={<NewExpense />} />
        </Route>
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
