import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  google_cancelled:     "Google 登入已取消，請重試",
  invite_invalid:       "邀請連結無效或已使用",
  invite_expired:       "邀請連結已過期，請聯絡管理員",
  account_inactive:     "此帳號已停用，請聯絡管理員",
  no_oauth_account:     "查無此 OAuth 帳號，請確認您已收到邀請",
  account_setup_failed: "帳號設定失敗，請聯絡管理員",
  google_failed:        "Google 驗證失敗，請重試",
};

const ROLE_PATH: Record<string, string> = {
  customer:       "/customer",
  driver:         "/driver",
  fusingao_fleet: "/fleet",
  fleet_sub:      "/fleet",
  fleet_owner:    "/franchise-fleet",
  admin:          "/admin",
};

export default function OAuthCallback() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");
    const err   = params.get("error");

    if (err) {
      setError(ERROR_MESSAGES[err] ?? "登入失敗，請重試");
      setTimeout(() => navigate("/login"), 2500);
      return;
    }

    if (!token) {
      setError("驗證失敗，請重試");
      setTimeout(() => navigate("/login"), 2000);
      return;
    }

    try {
      const [, payloadB64] = token.split(".");
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
      const user = { id: payload.id, role: payload.role, name: payload.name, phone: payload.phone, username: payload.username, fleetId: payload.fleetId };
      login(token, user);
      navigate(ROLE_PATH[payload.role] ?? `/${payload.role}`);
    } catch {
      setError("Token 解析失敗，請重試");
      setTimeout(() => navigate("/login"), 2000);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      {error ? (
        <div className="text-center bg-white rounded-2xl shadow-lg p-8 max-w-xs w-full mx-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-slate-700 font-semibold mb-1">登入失敗</p>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400 mt-3">正在返回登入頁…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <p className="text-slate-600 text-sm font-medium">登入驗證中，請稍候…</p>
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin mt-1" />
        </div>
      )}
    </div>
  );
}
