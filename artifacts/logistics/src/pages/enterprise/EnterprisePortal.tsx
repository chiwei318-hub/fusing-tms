import { useState, useCallback } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { GlobalHeader } from "@/components/GlobalHeader";
import { EnterpriseLayout, getEnterpriseSession, setEnterpriseSession, clearEnterpriseSession, type EnterpriseSession } from "@/components/EnterpriseLayout";
import EnterpriseLogin from "./EnterpriseLogin";
import EnterpriseDashboard from "./EnterpriseDashboard";
import EnterpriseOrders from "./EnterpriseOrders";
import EnterprisePlaceOrder from "./EnterprisePlaceOrder";
import EnterpriseNotifications from "./EnterpriseNotifications";
import EnterpriseSubAccounts from "./EnterpriseSubAccounts";
import EnterpriseAccount from "./EnterpriseAccount";

function loadSession(): EnterpriseSession | null {
  const fromLs = getEnterpriseSession();
  if (fromLs) return fromLs;
  try {
    const r = sessionStorage.getItem("enterprise-session");
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export default function EnterprisePortal() {
  const [location] = useLocation();
  const [session, setSession] = useState<EnterpriseSession | null>(() => loadSession());

  const handleLogin = useCallback((newSession: EnterpriseSession, remember: boolean) => {
    if (remember) {
      setEnterpriseSession(newSession);
    } else {
      sessionStorage.setItem("enterprise-session", JSON.stringify(newSession));
    }
    setSession(newSession);
  }, []);

  const handleLogout = useCallback(() => {
    clearEnterpriseSession();
    sessionStorage.removeItem("enterprise-session");
    setSession(null);
  }, []);

  const isAdmin = !session?.subAccount || session?.subAccount?.role === "admin";

  if (!session) {
    return (
      <>
        <GlobalHeader />
        <div className="pt-14">
          <EnterpriseLogin onLogin={handleLogin} />
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalHeader />
      <div className="pt-14">
        <EnterpriseLayout session={session} onLogout={handleLogout}>
          <Switch>
            <Route path="/enterprise">
              <EnterpriseDashboard session={session} />
            </Route>
            <Route path="/enterprise/place-order">
              <EnterprisePlaceOrder session={session} />
            </Route>
            <Route path="/enterprise/quick-order">
              <Redirect to="/enterprise/place-order" />
            </Route>
            <Route path="/enterprise/orders">
              <EnterpriseOrders session={session} />
            </Route>
            <Route path="/enterprise/notifications">
              <EnterpriseNotifications session={session} />
            </Route>
            <Route path="/enterprise/sub-accounts">
              {isAdmin ? <EnterpriseSubAccounts session={session} /> : <Redirect to="/enterprise" />}
            </Route>
            <Route path="/enterprise/account">
              <EnterpriseAccount session={session} />
            </Route>
          </Switch>
        </EnterpriseLayout>
      </div>
    </>
  );
}
