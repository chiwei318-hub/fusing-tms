import { useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";

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
    group: "基本資料維護",
    color: "border-blue-200 bg-blue-50",
    links: [
      {
        label: "車輛基本資料設定",
        url: `${BASE}/vehicleSetupBasicDataSetQuery.action`,
        desc: "查詢與維護車輛基本設定資料",
        icon: "🚛",
      },
      {
        label: "鄉鎮市區資料",
        url: `${BASE}/townshipBasicDataSetQuery.action`,
        desc: "鄉鎮市區基本資料查詢維護",
        icon: "🗺️",
      },
      {
        label: "客戶資料（泰立）",
        url: `${BASE}/customerBasicDataSetQueryTA.action`,
        desc: "泰立分公司客戶基本資料查詢",
        icon: "👤",
      },
    ],
  },
  {
    group: "車輛管理",
    color: "border-orange-200 bg-orange-50",
    links: [
      {
        label: "車輛稅務查詢",
        url: `${BASE}/vehicleTaxQuery.action`,
        desc: "車輛牌照稅、使用牌照稅管理",
        icon: "🧾",
      },
      {
        label: "車輛保險查詢",
        url: `${BASE}/vehicleInsuranceQuery.action`,
        desc: "車輛保險到期日與保費管理",
        icon: "🛡️",
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
      {
        label: "油料比較報表",
        url: `${BASE}/fuelReportComparisonQuery.action`,
        desc: "車輛油耗比較分析報表",
        icon: "⛽",
      },
      {
        label: "油料報表查詢",
        url: `${BASE}/fuelReportQuery.action`,
        desc: "車輛加油紀錄與油料報表查詢",
        icon: "🛢️",
      },
    ],
  },
];

export default function GloryPortalTab() {
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

  const totalLinks = GLORY_LINKS.reduce((s, g) => s + g.links.length, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl">🔗</span> Glory 平台快捷入口
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            點擊任一連結將在新分頁開啟 taylih.gloryplatform.com
            （需先登入 Glory 平台）
          </p>
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
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            共 {totalLinks} 個連結
          </span>
        </div>
      </div>

      {/* Login reminder banner */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <span className="text-lg shrink-0">⚠️</span>
        <span>
          使用前請先在另一個分頁登入{" "}
          <a
            href="https://taylih.gloryplatform.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2"
          >
            taylih.gloryplatform.com
          </a>
          ，登入後再點擊下方連結即可直接進入各功能頁面。
        </span>
      </div>

      {/* Link groups */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
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
                        <span className="font-semibold text-sm truncate">
                          {link.label}
                        </span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {link.desc}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-2 pb-1">
        <p className="text-xs text-muted-foreground">
          如需新增連結，請告知功能名稱與網址即可加入。
        </p>
      </div>
    </div>
  );
}
