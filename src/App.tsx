import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";

const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const HeldTickets = lazy(() => import("@/pages/HeldTickets"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Customers = lazy(() => import("@/pages/Customers"));
const Employees = lazy(() => import("@/pages/Employees"));
const Statistics = lazy(() => import("@/pages/Statistics"));
const SalesReport = lazy(() => import("@/pages/SalesReport"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Quotes = lazy(() => import("@/pages/Quotes"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders"));
const Suppliers = lazy(() => import("@/pages/Suppliers"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const AuditLogPage = lazy(() => import("@/pages/AuditLog"));
const PasswordResetsPage = lazy(() => import("@/pages/PasswordResets"));
const AccountApprovalsPage = lazy(() => import("@/pages/AccountApprovals"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const PendingApproval = lazy(() => import("@/pages/PendingApproval"));
const PayrollHistoryPage = lazy(() => import("@/pages/PayrollHistory"));
const FinancialStatementsPage = lazy(() => import("@/pages/FinancialStatements"));
const StockTaking = lazy(() => import("@/pages/StockTaking"));
const ClientBilling = lazy(() => import("@/pages/ClientBilling"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-paper">
      <div className="flex items-center gap-3 text-ink-mute text-sm">
        <span className="w-2 h-2 rounded-full bg-magenta-reg animate-pulse-dot" />
        Loading workspace...
      </div>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageFallback />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const basename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "hsl(224 45% 18%)",
            color: "hsl(38 32% 96%)",
            border: "1px solid hsl(224 45% 25%)",
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
        <Route path="/register" element={<Suspense fallback={<PageFallback />}><Register /></Suspense>} />
        <Route path="/change-password" element={<Suspense fallback={<PageFallback />}><ChangePassword /></Suspense>} />
        <Route path="/pending-approval" element={<Suspense fallback={<PageFallback />}><PendingApproval /></Suspense>} />
        <Route
          path="/"
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
          <Route path="held" element={<Suspense fallback={<PageFallback />}><HeldTickets /></Suspense>} />
          <Route path="quotes" element={<Suspense fallback={<PageFallback />}><Quotes /></Suspense>} />
          <Route path="inventory" element={<Suspense fallback={<PageFallback />}><Inventory /></Suspense>} />
          <Route path="stock-taking" element={<Suspense fallback={<PageFallback />}><StockTaking /></Suspense>} />
          <Route path="purchase-orders" element={<Suspense fallback={<PageFallback />}><PurchaseOrders /></Suspense>} />
          <Route path="suppliers" element={<Suspense fallback={<PageFallback />}><Suppliers /></Suspense>} />
          <Route path="customers" element={<Suspense fallback={<PageFallback />}><Customers /></Suspense>} />
          <Route path="client-billing" element={<Suspense fallback={<PageFallback />}><ClientBilling /></Suspense>} />
          <Route path="sales-report" element={<Suspense fallback={<PageFallback />}><SalesReport /></Suspense>} />
          <Route path="expenses" element={<Suspense fallback={<PageFallback />}><Expenses /></Suspense>} />
          <Route path="financial-statements" element={<Suspense fallback={<PageFallback />}><FinancialStatementsPage /></Suspense>} />
          <Route path="statistics" element={<Suspense fallback={<PageFallback />}><Statistics /></Suspense>} />
          <Route path="employees" element={<Suspense fallback={<PageFallback />}><Employees /></Suspense>} />
          <Route path="payroll-history" element={<Suspense fallback={<PageFallback />}><PayrollHistoryPage /></Suspense>} />
          <Route path="audit-log" element={<Suspense fallback={<PageFallback />}><AuditLogPage /></Suspense>} />
          <Route path="password-resets" element={<Suspense fallback={<PageFallback />}><PasswordResetsPage /></Suspense>} />
          <Route path="account-approvals" element={<Suspense fallback={<PageFallback />}><AccountApprovalsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
        </Route>
        <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
      </Routes>
    </BrowserRouter>
  );
}
