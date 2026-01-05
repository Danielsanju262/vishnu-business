import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";

import Customers from "./pages/Customers";
import Products from "./pages/Products";
import Dashboard from "./pages/Dashboard";
import NewSale from "./pages/NewSale";
import NewExpense from "./pages/NewExpense";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

import ScrollToTop from "./components/ScrollToTop";

import { AuthProvider, useAuth } from "./context/AuthContext";
import LockScreen from "./components/LockScreen";

function AppContent() {
  const { isLocked } = useAuth();

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
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Full screen wizards - No Bottom Bar */}
        <Route path="/sale/new" element={<NewSale />} />
        <Route path="/expense/new" element={<NewExpense />} />
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
