import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { Protected } from "@/components/Protected";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Invest from "@/pages/Invest";
import Deposit from "@/pages/Deposit";
import Withdraw from "@/pages/Withdraw";
import Referrals from "@/pages/Referrals";
import Coupons from "@/pages/Coupons";
import History from "@/pages/History";
import Profile from "@/pages/Profile";
import PaymentCallback from "@/pages/PaymentCallback";
import ForgotPassword from "@/pages/ForgotPassword";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminDeposits from "@/pages/admin/AdminDeposits";
import AdminWithdrawals from "@/pages/admin/AdminWithdrawals";
import AdminInvestments from "@/pages/admin/AdminInvestments";
import AdminReferrals from "@/pages/admin/AdminReferrals";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminPasswordResets from "@/pages/admin/AdminPasswordResets";
import MyPackages from "@/pages/MyPackages";
import { ThemeProvider } from "@/context/ThemeContext";

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Toaster richColors position="top-right" />
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/payment/callback" element={<PaymentCallback />} />

              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/invest" element={<Protected><Invest /></Protected>} />
              <Route path="/my-packages" element={<Protected><MyPackages /></Protected>} />
              <Route path="/team" element={<Protected><Referrals /></Protected>} />
              <Route path="/deposit" element={<Protected><Deposit /></Protected>} />
              <Route path="/withdraw" element={<Protected><Withdraw /></Protected>} />
              <Route path="/referrals" element={<Protected><Referrals /></Protected>} />
              <Route path="/coupons" element={<Protected><Coupons /></Protected>} />
              <Route path="/history" element={<Protected><History /></Protected>} />
              <Route path="/profile" element={<Protected><Profile /></Protected>} />

              <Route path="/admin" element={<Protected admin><AdminDashboard /></Protected>} />
              <Route path="/admin/users" element={<Protected admin><AdminUsers /></Protected>} />
              <Route path="/admin/products" element={<Protected admin><AdminProducts /></Protected>} />
              <Route path="/admin/deposits" element={<Protected admin><AdminDeposits /></Protected>} />
              <Route path="/admin/withdrawals" element={<Protected admin><AdminWithdrawals /></Protected>} />
              <Route path="/admin/investments" element={<Protected admin><AdminInvestments /></Protected>} />
              <Route path="/admin/referrals" element={<Protected admin><AdminReferrals /></Protected>} />
              <Route path="/admin/coupons" element={<Protected admin><AdminCoupons /></Protected>} />
              <Route path="/admin/password-resets" element={<Protected admin><AdminPasswordResets /></Protected>} />
              <Route path="/admin/settings" element={<Protected admin><AdminSettings /></Protected>} />

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
