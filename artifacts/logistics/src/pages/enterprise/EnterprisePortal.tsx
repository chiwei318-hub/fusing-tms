import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { GlobalHeader } from "@/components/GlobalHeader";
import { EnterpriseLayout, getEnterpriseSession } from "@/components/EnterpriseLayout";
import EnterpriseLogin from "./EnterpriseLogin";
import EnterpriseDashboard from "./EnterpriseDashboard";
import EnterpriseOrders from "./EnterpriseOrders";
import EnterpriseQuickOrder from "./EnterpriseQuickOrder";
import EnterpriseAccount from "./EnterpriseAccount";

function EnterpriseGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const session = getEnterpriseSession()
    ?? (() => {
      try { const r = sessionStorage.getItem("enterprise-session"); return r ? JSON.parse(r) : null; } catch { return null; }
    })();

  useEffect(() => {
    if (!session && location !== "/enterprise/login") {
      navigate("/enterprise/login");
    }
  }, [session, location]);

  if (!session) return null;

  return (
    <EnterpriseLayout session={session}>
      {children}
    </EnterpriseLayout>
  );
}

export default function EnterprisePortal() {
  const [location] = useLocation();
  const isLogin = location === "/enterprise/login";

  // Get session for passing to pages
  const session = getEnterpriseSession()
    ?? (() => {
      try { const r = sessionStorage.getItem("enterprise-session"); return r ? JSON.parse(r) : null; } catch { return null; }
    })();

  if (isLogin) {
    return (
      <>
        <GlobalHeader />
        <div className="pt-14">
          <EnterpriseLogin />
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalHeader />
      <div className="pt-14">
        <EnterpriseGuard>
          <Switch>
            <Route path="/enterprise">
              {session ? <EnterpriseDashboard session={session} /> : null}
            </Route>
            <Route path="/enterprise/quick-order">
              {session ? <EnterpriseQuickOrder session={session} /> : null}
            </Route>
            <Route path="/enterprise/orders">
              {session ? <EnterpriseOrders session={session} /> : null}
            </Route>
            <Route path="/enterprise/account">
              {session ? <EnterpriseAccount session={session} /> : null}
            </Route>
          </Switch>
        </EnterpriseGuard>
      </div>
    </>
  );
}
