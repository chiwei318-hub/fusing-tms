import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

interface InviteInfo {
  email: string;
  role: string;
  roleLabel: string;
}

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!token) { setError("邀請連結無效"); setLoading(false); return; }
    fetch(apiUrl(`/auth/invite/verify/${token}`))
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "邀請連結無效");
        return data as InviteInfo;
      })
      .then(data => {
        setInfo(data);
        return fetch(apiUrl(`/auth/google/url?role=${data.role}&invite_token=${token}`))
          .then(r => r.json())
          .then(d => setGoogleUrl(d.url ?? null));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleGoogleLogin = () => {
    if (!googleUrl) return;
    setStarting(true);
    window.location.href = googleUrl;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">富詠運輸</h1>
          <p className="text-sm text-slate-500 mt-1">帳號邀請</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardContent className="p-6">
            {loading && (
              <div className="text-center py-8 text-slate-500 text-sm">驗證邀請中…</div>
            )}

            {!loading && error && (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-slate-700 font-semibold mb-1">連結無法使用</p>
                <p className="text-sm text-slate-500">{error}</p>
              </div>
            )}

            {!loading && !error && info && (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5">
                  <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1">受邀身份</p>
                  <p className="text-base font-bold text-blue-800">{info.roleLabel}</p>
                  <p className="text-xs text-blue-600 mt-0.5">{info.email}</p>
                </div>

                <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                  請使用您的 Google 帳號登入，首次登入將自動綁定此帳號。之後每次都能以 Google 一鍵登入。
                </p>

                <Button
                  onClick={handleGoogleLogin}
                  disabled={!googleUrl || starting}
                  className="w-full h-11 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm gap-3 font-semibold rounded-xl text-sm"
                  variant="outline"
                >
                  {GOOGLE_ICON}
                  {starting ? "跳轉中…" : "使用 Google 登入並綁定"}
                </Button>

                <p className="text-center text-xs text-slate-400 mt-4">
                  此邀請連結僅能使用一次，有效期 7 天
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
