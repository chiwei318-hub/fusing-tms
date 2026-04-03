import { useEffect, useState } from "react";
import { Users, Plus, Trash2, X, Eye, EyeOff, ShieldCheck, ShoppingBag, UserCircle, ToggleRight, ToggleLeft, BookOpen, Search } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SubAccount = {
  id: number;
  name: string;
  subCode: string;
  role: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = { name: string; subCode: string; password: string; role: string; email: string; phone: string };
const BLANK: FormState = { name: "", subCode: "", password: "", role: "purchaser", email: "", phone: "" };

export default function EnterpriseSubAccounts({ session }: { session: EnterpriseSession }) {
  const [subs, setSubs] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/enterprise/${session.id}/sub-accounts`)
      .then(r => r.json()).then(setSubs).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [session.id]);

  const setF = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/sub-accounts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "建立失敗"); return; }
      setSubs(s => [data, ...s]);
      setShowForm(false); setForm(BLANK);
    } catch { setError("網路錯誤"); }
    finally { setSaving(false); }
  }

  async function toggleActive(sub: SubAccount) {
    const res = await fetch(`${BASE}/api/enterprise/${session.id}/sub-accounts/${sub.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !sub.isActive }),
    });
    if (res.ok) setSubs(s => s.map(x => x.id === sub.id ? { ...x, isActive: !x.isActive } : x));
  }

  async function deleteSub(id: number) {
    if (!confirm("確認刪除此子帳號？")) return;
    await fetch(`${BASE}/api/enterprise/${session.id}/sub-accounts/${id}`, { method: "DELETE" });
    setSubs(s => s.filter(x => x.id !== id));
  }

  const inp = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#0d2d6e]" />
          子帳號管理
        </h1>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-[#0d2d6e] hover:bg-[#1a3a8f] text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-[0.97]">
          <Plus className="w-4 h-4" />
          新增子帳號
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">多人帳號管理</p>
        <div className="text-blue-600/80 text-xs space-y-0.5">
          <p>・<strong>主管</strong>：可查看所有訂單、管理子帳號、存取所有功能</p>
          <p>・<strong>採購</strong>：可下單、查看自己的訂單，無法管理子帳號</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">新增子帳號</h2>
            <button onClick={() => { setShowForm(false); setForm(BLANK); setError(""); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">姓名 *</label>
                <input required value={form.name} onChange={e => setF("name", e.target.value)} placeholder="員工姓名" className={inp} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">登入帳號 *</label>
                <input required value={form.subCode} onChange={e => setF("subCode", e.target.value.toUpperCase())}
                  placeholder="例：FY001-WANG" className={inp} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">密碼 *</label>
              <div className="relative">
                <input required type={showPw ? "text" : "password"} value={form.password}
                  onChange={e => setF("password", e.target.value)} placeholder="至少 6 個字元" className={inp + " pr-10"} />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">角色權限</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "purchaser", icon: ShoppingBag,  label: "採購人員", desc: "可下單、查看訂單" },
                  { value: "admin",     icon: ShieldCheck,  label: "主管",     desc: "全部功能存取" },
                  { value: "finance",   icon: BookOpen,     label: "財務人員", desc: "查看帳單、報表" },
                  { value: "viewer",    icon: Search,       label: "唯讀人員", desc: "僅限查看訂單" },
                ].map(r => (
                  <label key={r.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                    ${form.role === r.value ? "border-[#0d2d6e] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="role" value={r.value} checked={form.role === r.value}
                      onChange={() => setF("role", r.value)} className="sr-only" />
                    <r.icon className={`w-5 h-5 shrink-0 ${form.role === r.value ? "text-[#0d2d6e]" : "text-gray-400"}`} />
                    <div>
                      <p className={`text-xs font-bold ${form.role === r.value ? "text-[#0d2d6e]" : "text-gray-700"}`}>{r.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Email（選填）</label>
                <input type="email" value={form.email} onChange={e => setF("email", e.target.value)} placeholder="員工 Email" className={inp} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">電話（選填）</label>
                <input value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="員工電話" className={inp} />
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2.5 rounded-xl">{error}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowForm(false); setForm(BLANK); setError(""); }}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">取消</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-[#0d2d6e] text-white text-sm font-bold rounded-xl hover:bg-[#1a3a8f] disabled:opacity-60">
                {saving ? "建立中..." : "建立子帳號"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-gray-400 text-sm">載入中...</div>
      ) : subs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold text-sm">尚無子帳號</p>
          <p className="text-gray-400 text-xs mt-1">新增員工帳號，讓同仁可以登入下單</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map(sub => (
            <div key={sub.id} className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${sub.isActive ? "border-gray-100" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  sub.role === "admin" ? "bg-purple-50" : sub.role === "finance" ? "bg-emerald-50" : sub.role === "viewer" ? "bg-gray-50" : "bg-blue-50"
                }`}>
                  {sub.role === "admin" ? <ShieldCheck className="w-5 h-5 text-purple-500" />
                    : sub.role === "finance" ? <BookOpen className="w-5 h-5 text-emerald-500" />
                    : sub.role === "viewer" ? <Search className="w-5 h-5 text-gray-500" />
                    : <ShoppingBag className="w-5 h-5 text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 text-sm">{sub.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      sub.role === "admin" ? "bg-purple-100 text-purple-700"
                        : sub.role === "finance" ? "bg-emerald-100 text-emerald-700"
                        : sub.role === "viewer" ? "bg-gray-100 text-gray-600"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {{ admin: "主管", purchaser: "採購", finance: "財務", viewer: "唯讀" }[sub.role] ?? sub.role}
                    </span>
                    {!sub.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">已停用</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-gray-500 font-mono">{sub.subCode}</p>
                    {sub.phone && <p className="text-xs text-gray-400">{sub.phone}</p>}
                    {sub.email && <p className="text-xs text-gray-400 hidden sm:block">{sub.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(sub)} title={sub.isActive ? "停用帳號" : "啟用帳號"}
                    className="text-gray-400 hover:text-[#0d2d6e] transition-colors p-1">
                    {sub.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => deleteSub(sub.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-amber-700 mb-1">子帳號登入方式</p>
        <p className="text-xs text-amber-600">子帳號員工請至企業入口，輸入子帳號代碼（例：FY001-WANG）及密碼登入，系統將自動識別為子帳號。</p>
      </div>
    </div>
  );
}
