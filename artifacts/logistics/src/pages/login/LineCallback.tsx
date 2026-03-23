import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function LineCallback() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      setError("LINE 登入已取消或失敗，請重試");
      setTimeout(() => navigate("/login"), 2000);
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
      const user = { id: payload.id, role: payload.role, name: payload.name, phone: payload.phone };
      login(token, user);
      navigate(`/${payload.role}`);
    } catch {
      setError("Token 解析失敗");
      setTimeout(() => navigate("/login"), 2000);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] to-[#1a3a8f] flex items-center justify-center">
      {error ? (
        <p className="text-white text-center">{error}</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="text-white text-sm">LINE 登入中，請稍候...</p>
        </div>
      )}
    </div>
  );
}
