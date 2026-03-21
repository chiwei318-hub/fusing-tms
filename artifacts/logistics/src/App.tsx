import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { CustomerLayout } from "@/components/CustomerLayout";
import { DriverLayout } from "@/components/DriverLayout";
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
import DriverHome from "@/pages/driver/DriverHome";
import DriverTasks from "@/pages/driver/DriverTasks";
import DriverTaskDetail from "@/pages/driver/DriverTaskDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
    },
  },
});

function CustomerPortal() {
  return (
    <CustomerLayout>
      <Switch>
        <Route path="/customer" component={CustomerHome} />
        <Route path="/customer/order" component={CustomerOrder} />
        <Route path="/customer/track" component={CustomerTrack} />
        <Route component={NotFound} />
      </Switch>
    </CustomerLayout>
  );
}

function DriverPortal() {
  return (
    <DriverLayout>
      <Switch>
        <Route path="/driver" component={DriverHome} />
        <Route path="/driver/tasks" component={DriverTasks} />
        <Route path="/driver/tasks/:id" component={DriverTaskDetail} />
        <Route component={NotFound} />
      </Switch>
    </DriverLayout>
  );
}

function AdminPortal() {
  return (
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
  );
}

function AppRouter() {
  const [location] = useLocation();

  if (location === "/" || location === "") {
    return <Landing />;
  }
  if (location.startsWith("/customer")) {
    return <CustomerPortal />;
  }
  if (location.startsWith("/driver")) {
    return <DriverPortal />;
  }
  return <AdminPortal />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
