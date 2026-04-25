import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { CustomerLayout } from "@/components/CustomerLayout";
import { DriverLayout } from "@/components/DriverLayout";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
// ─── Static imports (always on the critical path) ───────────────────────────
import OrderForm from "@/pages/OrderForm";
import OrderList from "@/pages/OrderList";
import OrderReport from "@/pages/OrderReport";
import OrderDetail from "@/pages/OrderDetail";
import Fees from "@/pages/Fees";
import LoginPortal from "@/pages/LoginPortal";
import CustomerLogin from "@/pages/login/CustomerLogin";
import DriverLogin from "@/pages/login/DriverLogin";
import AdminLogin from "@/pages/login/AdminLogin";
import FleetLogin from "@/pages/fleet/FleetLogin";
import FranchiseFleetLogin from "@/pages/franchiseFleet/FranchiseFleetLogin";
import LineCallback from "@/pages/login/LineCallback";

// ─── Lazy imports (code-split by portal) ─────────────────────────────────────
const PageFallback = () => (
  <div className="flex items-center justify-center h-dvh text-gray-400 text-sm">載入中…</div>
);

const Admin              = lazy(() => import("@/pages/Admin"));
const DispatchCenter     = lazy(() => import("@/pages/admin/DispatchCenter"));
const FinanceDashboard   = lazy(() => import("@/pages/admin/FinanceDashboard"));
const FuelCardManager    = lazy(() => import("@/pages/admin/FuelCardManager"));
const CashSettlement     = lazy(() => import("@/pages/admin/CashSettlement"));
const FourLayerSummary   = lazy(() => import("@/pages/admin/FourLayerSummary"));
const EnterprisePortal   = lazy(() => import("@/pages/enterprise/EnterprisePortal"));
const FusingaoPortal     = lazy(() => import("@/pages/FusingaoPortal"));
const FusingaoFleetPortal= lazy(() => import("@/pages/fleet/FusingaoFleetPortal"));
const PublicFleetReport  = lazy(() => import("@/pages/fleet/PublicFleetReport"));
const FranchiseFleetPortal= lazy(() => import("@/pages/franchiseFleet/FranchiseFleetPortal"));
const AIChat             = lazy(() => import("@/pages/AIChat"));
const QuotePage          = lazy(() => import("@/pages/QuotePage"));
const InvoicePrint       = lazy(() => import("@/pages/InvoicePrint"));
const QuickOrder         = lazy(() => import("@/pages/QuickOrder"));
const QuickTrack         = lazy(() => import("@/pages/QuickTrack"));
const PublicTrack        = lazy(() => import("@/pages/PublicTrack"));
const Landing            = lazy(() => import("@/pages/Landing"));
const DriverJoinPage     = lazy(() => import("@/pages/DriverJoinPage"));
const FleetJoinPage      = lazy(() => import("@/pages/FleetJoinPage"));
const CustomerRegister   = lazy(() => import("@/pages/register/CustomerRegister"));
const EnterpriseRegister = lazy(() => import("@/pages/register/EnterpriseRegister"));
const DriverRegister     = lazy(() => import("@/pages/register/DriverRegister"));
const CustomerHome       = lazy(() => import("@/pages/customer/CustomerHome"));
const CustomerTrack      = lazy(() => import("@/pages/customer/CustomerTrack"));
const CustomerOrder      = lazy(() => import("@/pages/customer/CustomerOrder"));
const CustomerNotificationsPage = lazy(() => import("@/pages/customer/CustomerNotificationsPage"));
const DriverHome         = lazy(() => import("@/pages/driver/DriverHome"));
const DriverTasks        = lazy(() => import("@/pages/driver/DriverTasks"));
const DriverTaskDetail   = lazy(() => import("@/pages/driver/DriverTaskDetail"));
const DriverGrab         = lazy(() => import("@/pages/driver/DriverGrab"));
const DriverIncome       = lazy(() => import("@/pages/driver/DriverIncome"));

// ─── Global ErrorBoundary ────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: "" };
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-dvh gap-4 text-center p-8">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-black">畫面發生錯誤</h2>
          <p className="text-muted-foreground text-sm max-w-sm">{this.state.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); window.location.reload(); }}
            className="mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700"
          >
            重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── QueryClient ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
      retry: 1,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

function RequireAuth({ role, children }: { role: "customer" | "driver" | "admin"; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== role) {
    return <Redirect to={`/login/${role}`} />;
  }
  return <>{children}</>;
}

function CustomerPortal() {
  return (
    <RequireAuth role="customer">
      <GlobalHeader />
      <div className="h-dvh overflow-hidden pt-20">
        <CustomerLayout>
          <Switch>
            <Route path="/customer" component={CustomerHome} />
            <Route path="/customer/order" component={CustomerOrder} />
            <Route path="/customer/track" component={CustomerTrack} />
            <Route path="/customer/notifications" component={CustomerNotificationsPage} />
            <Route component={NotFound} />
          </Switch>
        </CustomerLayout>
      </div>
    </RequireAuth>
  );
}

function DriverPortal() {
  return (
    <RequireAuth role="driver">
      <GlobalHeader />
      <div className="h-dvh overflow-hidden pt-20">
        <DriverLayout>
          <Switch>
            <Route path="/driver" component={DriverHome} />
            <Route path="/driver/grab" component={DriverGrab} />
            <Route path="/driver/tasks" component={DriverTasks} />
            <Route path="/driver/tasks/:id" component={DriverTaskDetail} />
            <Route path="/driver/income" component={DriverIncome} />
            <Route component={NotFound} />
          </Switch>
        </DriverLayout>
      </div>
    </RequireAuth>
  );
}

function AdminPortal() {
  return (
    <RequireAuth role="admin">
      <GlobalHeader />
      <div className="h-dvh overflow-hidden pt-20">
        <AppLayout>
          <Switch>
            <Route path="/" component={() => <Redirect to="/order-form" />} />
            <Route path="/order-form" component={OrderForm} />
            <Route path="/orders" component={OrderList} />
            <Route path="/orders/:id" component={OrderDetail} />
            <Route path="/report" component={OrderReport} />
            <Route path="/fees" component={Fees} />
            <Route path="/admin" component={Admin} />
            <Route path="/dispatch" component={DispatchCenter} />
            <Route path="/finance" component={FinanceDashboard} />
            <Route path="/fusingao" component={FusingaoPortal} />
            <Route path="/fuel-cards" component={FuelCardManager} />
            <Route path="/cash-settlement" component={CashSettlement} />
            <Route path="/four-layer-summary" component={FourLayerSummary} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </div>
    </RequireAuth>
  );
}

// Auto-login for admin "進入管理" — reads token from URL query param ?t=<base64>
function FleetAutoLogin() {
  const { loginTemp } = useAuth();
  const [, navigate] = useLocation();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t) {
      try {
        const raw = decodeURIComponent(escape(atob(t)));
        const { token, user: fleetUser } = JSON.parse(raw);
        loginTemp(token, fleetUser);
      } catch { /* bad payload, will fall through to login */ }
    }
    // Clear the token from the URL then go to fleet portal
    window.history.replaceState(null, "", "/fleet");
    navigate("/fleet");
    setDone(true);
  }, []); // eslint-disable-line

  if (!done) return <div className="min-h-screen bg-gradient-to-br from-slate-900 to-orange-900 flex items-center justify-center"><span className="text-white text-sm">正在驗證身份…</span></div>;
  return null;
}

function FleetPortal() {
  const { user } = useAuth();
  if (!user || (user.role !== "fusingao_fleet" && user.role !== "fleet_sub")) {
    return <Redirect to="/login/fleet" />;
  }
  return <FusingaoFleetPortal />;
}

function FranchiseFleetRoute() {
  const { user } = useAuth();
  if (!user || user.role !== "fleet_owner") {
    return <Redirect to="/login/franchise-fleet" />;
  }
  return <FranchiseFleetPortal />;
}

function AppRouter() {
  const [location] = useLocation();

  if (location === "/" || location === "") {
    return <div className="h-dvh overflow-y-auto"><Landing /></div>;
  }
  if (location === "/login") {
    return <div className="h-dvh overflow-y-auto"><LoginPortal /></div>;
  }
  if (location === "/login/customer") {
    return <CustomerLogin />;
  }
  if (location === "/login/driver") {
    return <DriverLogin />;
  }
  if (location === "/login/admin") {
    return <AdminLogin />;
  }
  if (location === "/login/fleet") {
    return <FleetLogin />;
  }
  if (location === "/login/franchise-fleet") {
    return <FranchiseFleetLogin />;
  }
  if (location === "/login/callback") {
    return <LineCallback />;
  }
  if (location === "/register/customer") {
    return <CustomerRegister />;
  }
  if (location === "/register/enterprise") {
    return <EnterpriseRegister />;
  }
  if (location === "/register/driver") {
    return <DriverRegister />;
  }
  if (location === "/chat") {
    return <AIChat />;
  }
  if (location === "/driver-join") {
    return <DriverJoinPage />;
  }
  if (location === "/fleet-join") {
    return <FleetJoinPage />;
  }
  if (location === "/track" || location.startsWith("/track?")) {
    return <div className="h-dvh overflow-y-auto"><PublicTrack /></div>;
  }
  if (location === "/quick" || location.startsWith("/quick/")) {
    if (location.startsWith("/quick/track/")) {
      return <div className="h-dvh overflow-y-auto"><QuickTrack /></div>;
    }
    return <div className="h-dvh overflow-y-auto"><QuickOrder /></div>;
  }
  if (location.startsWith("/invoice-print/")) {
    return <InvoicePrint />;
  }
  if (location === "/quote" || location.startsWith("/quote/")) {
    return <div className="h-dvh overflow-y-auto"><QuotePage /></div>;
  }
  if (location.startsWith("/customer")) {
    return <CustomerPortal />;
  }
  if (location.startsWith("/driver")) {
    return <DriverPortal />;
  }
  if (location.startsWith("/enterprise")) {
    return <EnterprisePortal />;
  }
  if (location.startsWith("/franchise-fleet")) {
    return <FranchiseFleetRoute />;
  }
  if (location.startsWith("/fleet/report/")) {
    return <PublicFleetReport />;
  }
  if (location.startsWith("/fleet/auto-login")) {
    return <FleetAutoLogin />;
  }
  if (location.startsWith("/fleet")) {
    return <FleetPortal />;
  }
  if (
    location.startsWith("/admin") ||
    location.startsWith("/order") ||
    location.startsWith("/fees") ||
    location.startsWith("/dispatch") ||
    location.startsWith("/finance") ||
    location.startsWith("/fuel-cards") ||
    location.startsWith("/cash-settlement") ||
    location.startsWith("/four-layer-summary")
  ) {
    return <AdminPortal />;
  }
  return <AdminPortal />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Suspense fallback={<PageFallback />}>
                <AppRouter />
              </Suspense>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
