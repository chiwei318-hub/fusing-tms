import { ExternalLink, Search, X, ArrowRight } from "lucide-react";
import { useState } from "react";

const BASE = "https://taylih.gloryplatform.com/e-order";

interface GloryLink {
  label: string;
  url: string;
  desc: string;
  icon: string;
}

interface GloryGroup {
  group: string;
  color: string;
  links: GloryLink[];
}

const GLORY_LINKS: GloryGroup[] = [
  {
    group: "客戶資料",
    color: "border-blue-200 bg-blue-50",
    links: [
      {
        label: "客戶資料（泰立）",
        url: `${BASE}/customerBasicDataSetQueryTA.action`,
        desc: "泰立分公司客戶基本資料查詢",
        icon: "👤",
      },
    ],
  },
  {
    group: "績效與報表",
    color: "border-green-200 bg-green-50",
    links: [
      {
        label: "每日車輛績效",
        url: `${BASE}/VehiclePerformancePerDayQuery.action`,
        desc: "每日車輛出勤績效查詢",
        icon: "📊",
      },
    ],
  },
];

interface Props {
  onNavigate?: (tab: string) => void;
}

const INTERNAL_MODULES = [
  {
    id: "vehicles",
    icon: "🚛",
    label: "車輛管理",
    desc: "車輛 CRUD、稅務 / 保險 / eTag 明細、狀態追蹤",
    color: "border-orange-200 bg-orange-50 hover:border-orange-400",
  },
  {
    id: "fuel",
    icon: "⛽",
    label: "油料管理",
    desc: "加油記錄、各車油耗比較報表、總金額統計",
    color: "border-amber-200 bg-amber-50 hover:border-amber-400",
  },
  {
    id: "driverbonus",
    icon: "💰",
    label: "司機獎金",
    desc: "獎金明細、一鍵標記已發放、待發金額彙總",
    color: "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
  },
  {
    id: "township",
    icon: "🗺️",
    label: "鄉鎮市區",
    desc: "台灣 22 縣市行政區資料、可新增 / 修改 / 刪除",
    color: "border-sky-200 bg-sky-50 hover:border-sky-400",
  },
  {
    id: "supplier",
    icon: "🏭",
    label: "供應商管理",
    desc: "供應商資料、聯絡人、服務區域、傭金率、銀行帳號",
    color: "border-purple-200 bg-purple-50 hover:border-purple-400",
  },
  {
    id: "contractquote",
    icon: "📝",
    label: "合約報價",
    desc: "報價單建立與管理、路線費率、草稿 / 確認 / 過期狀態",
    color: "border-indigo-200 bg-indigo-50 hover:border-indigo-400",
  },
];

export default function GloryPortalTab({ onNavigate }: Props) {
  const [search, setSearch] = useState("");

  const filtered = GLORY_LINKS.map(g => ({
    ...g,
    links: g.links.filter(
      l =>
        !search ||
        l.label.includes(search) ||
        l.desc.includes(search) ||
        g.group.includes(search)
    ),
  })).filter(g => g.links.length > 0);

  return (
    <div className="space-y-6">

      {/* ── 後台管理中心 ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🖥️</span>
          <div>
            <h2 className="text-base font-bold text-gray-800">後台管理中心</h2>
            <p className="text-xs text-muted-foreground">以下功能已整合至本系統，無需前往外部 Glory 平台</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {INTERNAL_MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => onNavigate?.(m.id)}
              className={`group flex items-start gap-3 p-4 rounded-lg border text-left transition-all hover:shadow-md ${m.color}`}
            >
              <span className="text-2xl shrink-0 mt-0.5">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-gray-800">{m.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-700 transition-colors shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* ── Glory 平台外部連結（剩餘） ─────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <div>
              <h2 className="text-base font-bold text-gray-800">Glory 平台外部連結</h2>
              <p className="text-xs text-muted-foreground">需先登入 taylih.gloryplatform.com</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜尋功能..."
                className="h-8 pl-9 pr-7 text-sm bg-card border rounded-md outline-none w-40 focus:ring-2 focus:ring-primary/30 transition"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
          <span className="text-lg shrink-0">⚠️</span>
          <span>
            使用前請先在另一個分頁登入{" "}
            <a href="https://taylih.gloryplatform.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
              taylih.gloryplatform.com
            </a>
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm">找不到符合「{search}」的功能</div>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(group => (
              <div key={group.group}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {group.group}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {group.links.map(link => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group flex items-start gap-3 p-3 rounded-lg border ${group.color} hover:shadow-md hover:scale-[1.01] transition-all`}
                    >
                      <span className="text-2xl shrink-0 mt-0.5">{link.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm truncate">{link.label}</span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{link.desc}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
