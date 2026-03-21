import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import NotFound from "@/pages/not-found";
import OrderForm from "@/pages/OrderForm";
import OrderList from "@/pages/OrderList";
import OrderDetail from "@/pages/OrderDetail";
import Admin from "@/pages/Admin";
import Fees from "@/pages/Fees";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 2,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/order-form" />} />
      <Route path="/order-form" component={OrderForm} />
      <Route path="/orders" component={OrderList} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route path="/fees" component={Fees} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppLayout>
            <Router />
          </AppLayout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
