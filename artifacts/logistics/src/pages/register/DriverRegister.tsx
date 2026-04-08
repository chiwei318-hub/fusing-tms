import { useState } from "react";
import { Link } from "wouter";
import { Truck, User, Phone, Lock, Eye, EyeOff, ChevronLeft, Car, CheckCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

const VEHICLE_TYPES = [
  "機車", "轎車", "小貨車", "廂型車", "箱型車（一般）", "箱型車（大型）",
  "冷藏車", "冷凍車", "平板車", "尾門車", "吊車", "其他",
];

export default function DriverRegister() {
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", phone: "", vehicleType: "", licensePlate: "", password: "", confirm: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [lineToken, setLineToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const copyToken = () => {
    if (!lineToken) return;
    navigator.clipboard.writeText(`綁定碼 ${lineToken}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("兩次密碼不一致"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/register/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, phone: form.phone,
          vehicleType: form.vehicleType, licensePlate: form.licensePlate,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "申請失敗"); return; }
      setLineToken(data.lineBindingToken ?? null);
      setDone(true);
      toast({ title: "申請成功！", description: data.message });
    } catch { setError("網路錯誤，請稍後再試"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/login/driver">
          <button className="flex items-center gap-1 text-blue-300/70 hover:text-blue-200 text-sm mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 返回登入
          </button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-600/30">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl leading-tight">司機申請加入</h1>
            <p className="text-blue-300 text-xs">填寫資料，審核通過後即可接單</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {done ? (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-lg font-bold text-gray-800">申請已收到！</p>
                <p className="text-xs text-gray-500 leading-relaxed">審核通過後以電話通知您，通常 1–2 個工作天。</p>
              </div>

              {lineToken && (
                <div className="bg-[#06C755]/8 border border-[#06C755]/30 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                    <span className="text-base">📱</span> 同步綁定 LINE 接收派車通知
                  </p>

                  {/* 步驟 1 */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-600">① 加入富詠運輸官方帳號</p>
                    <p className="text-xs text-gray-500">開啟 LINE → 搜尋「富詠運輸」或掃描 QR Code 加為好友。</p>
                  </div>

                  {/* 步驟 2 */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-600">② 傳送以下訊息給機器人</p>
                    <div className="bg-white border border-[#06C755]/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <span className="font-mono font-bold text-gray-800 tracking-widest text-base">
                        綁定碼 {lineToken}
                      </span>
                      <button
                        onClick={copyToken}
                        className="flex items-center gap-1 text-xs text-[#06C755] font-semibold hover:opacity-70 transition-opacity shrink-0"
                      >
                        {copied
                          ? <><Check className="w-3.5 h-3.5" /> 已複製</>
                          : <><Copy className="w-3.5 h-3.5" /> 複製</>
                        }
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">綁定碼有效期限：48 小時</p>
                  </div>

                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    完成後，機器人將確認綁定。即使帳號尚在審核，派車通知在開通後會自動推送，不需再操作。
                  </p>
                </div>
              )}

              <Link href="/login/driver">
                <Button variant="outline" className="w-full">返回登入頁</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">真實姓名 *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input value={form.name} onChange={set("name")} placeholder="陳大明" className="h-11 pl-9" required />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">手機號碼 *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input value={form.phone} onChange={set("phone")} placeholder="0912345678" inputMode="tel" className="h-11 pl-9" required />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">車種 *</label>
                <div className="relative">
                  <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={form.vehicleType}
                    onChange={set("vehicleType")}
                    className="w-full h-11 pl-9 pr-3 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value="">請選擇車種</option>
                    {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">車牌號碼 *</label>
                <div className="relative">
                  <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input value={form.licensePlate} onChange={set("licensePlate")} placeholder="ABC-1234" className="h-11 pl-9 uppercase" required />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">設定登入密碼（至少 6 位）*</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type={showPwd ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="••••••••" className="h-11 pl-9 pr-10" required />
                  <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">確認密碼 *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type={showPwd ? "text" : "password"} value={form.confirm} onChange={set("confirm")} placeholder="••••••••" className="h-11 pl-9" required />
                </div>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                {loading ? "送出中…" : "送出申請"}
              </Button>
              <p className="text-center text-xs text-gray-400">
                已有帳號？<Link href="/login/driver" className="text-blue-600 underline">直接登入</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
