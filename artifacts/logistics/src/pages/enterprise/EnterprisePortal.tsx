import { useEffect } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { GlobalHeader } from "@/components/GlobalHeader";
import { EnterpriseLayout, getEnterpriseSession } from "@/components/EnterpriseLayout";
import EnterpriseLogin from "./EnterpriseLogin";
import EnterpriseDashboard from "./EnterpriseDashboard";
import EnterpriseOrders from "./EnterpriseOrders";
import EnterprisePlaceOrder from "./EnterprisePlaceOrder";
import EnterpriseNotifications from "./EnterpriseNotifications";
import EnterpriseSubAccounts from "./EnterpriseSubAccounts";
import EnterpriseAccount from "./EnterpriseAccount";

function getSession() {
  const fromLs = getEnterpriseSession();
  if (fromLs) return fromLs;
  try {
    const r = sessionStorage.getItem("enterprise-session");
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

function EnterpriseGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const session = getSession();

  useEffect(() => {
    if (!session && location !== "/enterprise/login") {
      navigate("/enterprise/login");
    }
  }, [session, location]);

  if (!session) return null;
  return <EnterpriseLayout session={session}>{children}</EnterpriseLayout>;
}

export default function EnterprisePortal() {
  const [location] = useLocation();
  const isLogin = location === "/enterprise/login";
  const session = getSession();
  const isAdmin = !session?.subAccount || session?.subAccount?.role === "admin";

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
            <Route path="/enterprise/place-order">
              {session ? <EnterprisePlaceOrder session={session} /> : null}
            </Route>
            <Route path="/enterprise/quick-order">
              <Redirect to="/enterprise/place-order" />
            </Route>
            <Route path="/enterprise/orders">
              {session ? <EnterpriseOrders session={session} /> : null}
            </Route>
            <Route path="/enterprise/notifications">
              {session ? <EnterpriseNotifications session={session} /> : null}
            </Route>
            <Route path="/enterprise/sub-accounts">
              {session && isAdmin ? <EnterpriseSubAccounts session={session} /> : session ? <Redirect to="/enterprise" /> : null}
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
