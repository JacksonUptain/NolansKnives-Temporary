import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import SiteHeader from "./components/SiteHeader";
import Toast from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";

// Pages
import Home from "./pages/Home";
import Gallery from "./pages/Gallery";
import Store from "./pages/Store";
import Account from "./pages/Account";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import Unauthorized from "./pages/Unauthorized";
import Checkout from "./pages/Checkout";
import MyKnives from "./pages/MyKnives";
import MyAccount from "./pages/MyAccount";
import PurchaseDetail from "./pages/PurchaseDetail";
import ProductPage from "./pages/ProductPage";
import CustomKnifeRequest from "./pages/CustomKnifeRequest";
import CustomRequestConfirmation from "./pages/CustomRequestConfirmation";
import CustomFinalPayment from "./pages/CustomFinalPayment";

// Route guards
import RequireAuth from "./auth/RequireAuth";
import RequireActiveUser from "./auth/RequireActiveUser";
import RequireBusiness from "./auth/RequireBusiness";
import RequireAdmin from "./auth/RequireAdmin";

// Dashboards
import BusinessDashboardShell from "./pages/BusinessDashboard/BusinessDashboardShell";
import AdminDashboardShell from "./pages/AdminDashboard/AdminDashboardShell";

function App() {
  return (
    <Router>
      <AuthProvider>
        <SiteHeader />
        <Toast />
        <ConfirmDialog />
        <div className="page-transition">
          <Routes>
          {/* Public pages */}
          <Route path="/" element={<Home />} />
          <Route path="/Home" element={<Home />} />
          <Route path="/Gallery" element={<Gallery />} />
          <Route path="/Store" element={<Store />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="/custom-knife-request" element={<CustomKnifeRequest />} />
          <Route path="/custom-knife/confirmation/:requestId" element={<CustomRequestConfirmation />} />

          {/* Authentication */}
          <Route path="/account" element={<Account />} />
          <Route path="/account/verify-email" element={<VerifyEmailPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Customer pages */}
          <Route
            path="/checkout/:knifeId"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <Checkout />
                </RequireActiveUser>
              </RequireAuth>
            }
          />
          <Route
            path="/my-knives"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <MyKnives />
                </RequireActiveUser>
              </RequireAuth>
            }
          />
          <Route
            path="/my-knives/:requestId/final-payment"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <CustomFinalPayment />
                </RequireActiveUser>
              </RequireAuth>
            }
          />
          <Route
            path="/my-knives/:orderId"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <PurchaseDetail />
                </RequireActiveUser>
              </RequireAuth>
            }
          />
          <Route
            path="/my-account"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <MyAccount />
                </RequireActiveUser>
              </RequireAuth>
            }
          />

          {/* Business Dashboard (shell with nested routes) */}
          <Route
            path="/business/*"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <RequireBusiness>
                    <BusinessDashboardShell />
                  </RequireBusiness>
                </RequireActiveUser>
              </RequireAuth>
            }
          />

          {/* Admin Dashboard (shell with nested routes) */}
          <Route
            path="/admin/*"
            element={
              <RequireAuth>
                <RequireActiveUser>
                  <RequireAdmin>
                    <AdminDashboardShell />
                  </RequireAdmin>
                </RequireActiveUser>
              </RequireAuth>
            }
          />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
