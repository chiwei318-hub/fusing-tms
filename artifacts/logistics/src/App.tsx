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
import Landing from "@/pages/Landing";
import OrderForm from "@/pages/OrderForm";
import OrderList from "@/pages/OrderList";
import OrderDetail from "@/pages/OrderDetail";
import Admin from "@/pages/Admin";
import Fees from "@/pages/Fees";
import CustomerHome from "@/pages/customer/CustomerHome";
import CustomerTrack from "@/pages/customer/CustomerTrack";
import CustomerOrder from "@/pages/customer/CustomerOrder";
import CustomerNotificationsPage from "@/pages/customer/CustomerNotificationsPage";
import DriverHome from "@/pages/driver/DriverHome";
import DriverTasks from "@/pages/driver/DriverTasks";
import DriverTaskDetail from "@/pages/driver/DriverTaskDetail";
import DriverGrab from "@/pages/driver/DriverGrab";
import DriverIncome from "@/pages/driver/DriverIncome";
import EnterprisePortal from "@/pages/enterprise/EnterprisePortal";
import LoginPortal from "@/pages/LoginPortal";
import CustomerLogin from "@/pages/login/CustomerLogin";
import DriverLogin from "@/pages/login/DriverLogin";
import AdminLogin from "@/pages/login/AdminLogin";
import LineCallback from "@/pages/login/LineCallback";
import AIChat from "@/pages/AIChat";
import DriverJoinPage from "@/pages/DriverJoinPage";
import FleetJoinPage from "@/pages/FleetJoinPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
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
            <Route path="/fees" component={Fees} />
            <Route path="/admin" component={Admin} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </div>
    </RequireAuth>
  );
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
  if (location === "/login/callback") {
    return <LineCallback />;
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
  if (location.startsWith("/customer")) {
    return <CustomerPortal />;
  }
  if (location.startsWith("/driver")) {
    return <DriverPortal />;
  }
  if (location.startsWith("/enterprise")) {
    return <EnterprisePortal />;
  }
  if (
    location.startsWith("/admin") ||
    location.startsWith("/order") ||
    location.startsWith("/fees")
  ) {
    return <AdminPortal />;
  }
  return <AdminPortal />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
