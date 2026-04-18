import { useState } from "react";
import { Search, X, Upload, ChevronRight, ArrowUpRight } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import VehicleTab from "./VehicleTab";
import FuelTab from "./FuelTab";
import DriverBonusTab from "./DriverBonusTab";
import TownshipTab from "./TownshipTab";
import SupplierTab from "./SupplierTab";
import ContractQuoteTab from "./ContractQuoteTab";

type SubTab = "vehicles" | "fuel" | "driverbonus" | "township" | "supplier" | "contractquote" | "glory_links";

interface GloryLink {
  label: string;
  sub?: SubTab;
  adminTab?: string;
  desc: string;
  icon: string;
}

interface GloryGroup {
  group: string;
  groupShort: string;
  accentColor: string;
  bgColor: string;
  badgeStyle: React.CSSProperties;
  links: GloryLink[];
}

const GLORY_LINKS: GloryGroup[] = [
  {
    group: "基本資料",
    groupShort: "基本",
    accentColor: "#2563eb",
    bgColor: "#eff6ff",
    badgeStyle: { background: "#dbeafe", color: "#1d4ed8", borderColor: "#bfdbfe" },
    links: [
      { label: "客戶資料",   sub: undefined, adminTab: "customers", desc: "客戶查詢、匯出 Excel",            icon: "👤" },
      { label: "廠商資料",   sub: "supplier", adminTab: undefined,  desc: "廠商編號、聯絡人、統編",          icon: "🏭" },
      { label: "車輛資料",   sub: "vehicles", adminTab: undefined,  desc: "車號、車型、出廠年月、最大載重",  icon: "🚛" },
      { label: "縣市資料",   sub: "township", adminTab: undefined,  desc: "縣市代碼與名稱維護",              icon: "🏙️" },
      { label: "鄉鎮資料",   sub: "township", adminTab: undefined,  desc: "鄉鎮代碼與所屬縣市",              icon: "🗺️" },
      { label: "報價車型",   sub: "contractquote", adminTab: undefined, desc: "車輛類型代碼 0.6T…43T",       icon: "🚚" },
      { label: "自動化客服", sub: undefined, adminTab: "line",      desc: "RAG 處理司機與客戶 FAQ",          icon: "🤖" },
    ],
  },
  {
    group: "報價作業",
    groupShort: "報價",
    accentColor: "#d97706",
    bgColor: "#fffbeb",
    badgeStyle: { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" },
    links: [
      { label: "報價單維護", sub: "contractquote", adminTab: undefined, desc: "新增、編輯報價單",            icon: "✏️" },
      { label: "報價基準區", sub: "contractquote", adminTab: undefined, desc: "報價單號與生效日期查詢",      icon: "📋" },
      { label: "報價主管理", sub: undefined, adminTab: "quotes",        desc: "報價主清單與生效日期",         icon: "📝" },
      { label: "結算緣線",   sub: "contractquote", adminTab: undefined, desc: "報價緣線結算範例說明",         icon: "📐" },
    ],
  },
  {
    group: "訂單作業",
    groupShort: "訂單",
    accentColor: "#059669",
    bgColor: "#f0fdf4",
    badgeStyle: { background: "#dcfce7", color: "#065f46", borderColor: "#a7f3d0" },
    links: [
      { label: "訂單維護",   sub: undefined, adminTab: "orders",      desc: "訂單新增、編輯管理",            icon: "✏️" },
      { label: "回單批價",   sub: undefined, adminTab: "settlement",  desc: "回單批價作業查詢",              icon: "💲" },
      { label: "外包運費",   sub: undefined, adminTab: "outsourcing", desc: "外包車輛運費管理",              icon: "🚐" },
      { label: "代墊款",     sub: undefined, adminTab: "invoice",     desc: "代墊款查詢管理",                icon: "💴" },
      { label: "運費校對",   sub: undefined, adminTab: "settlement",  desc: "運費校對單查詢",                icon: "🔍" },
      { label: "運費請款",   sub: undefined, adminTab: "invoice",     desc: "運費請款單建立查詢",            icon: "🧾" },
      { label: "訂單查詢",   sub: undefined, adminTab: "order-search", desc: "日期區間、車型、路線查詢",     icon: "📦" },
    ],
  },
  {
    group: "派遣作業",
    groupShort: "派遣",
    accentColor: "#ea580c",
    bgColor: "#fff7ed",
    badgeStyle: { background: "#ffedd5", color: "#9a3412", borderColor: "#fed7aa" },
    links: [
      { label: "訂單派遣",   sub: undefined, adminTab: "dispatch", desc: "訂單派遣查詢管理",                icon: "📋" },
      { label: "車輛總覽",   sub: "vehicles", adminTab: undefined, desc: "車輛即時狀態總覽",                icon: "🚛" },
      { label: "貨況追蹤",   sub: undefined, adminTab: "smart",   desc: "貨物即時狀態追蹤",                icon: "📍" },
      { label: "派遣收據",   sub: undefined, adminTab: "orders",  desc: "收據單號、日期、車輛查詢",         icon: "🧾" },
      { label: "動態排程優化", sub: undefined, adminTab: "smart", desc: "AI 分析交通、優化派單邏輯",        icon: "🧠" },
    ],
  },
  {
    group: "管理作業",
    groupShort: "管理",
    accentColor: "#dc2626",
    bgColor: "#fff1f2",
    badgeStyle: { background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" },
    links: [
      { label: "司機日報",   sub: "driverbonus", adminTab: undefined, desc: "司機每日出勤業績",             icon: "🧑‍✈️" },
      { label: "車輛稅費",   sub: "vehicles",    adminTab: undefined, desc: "車輛稅費查詢管理",             icon: "🧾" },
      { label: "車輛保險",   sub: "vehicles",    adminTab: undefined, desc: "車輛保險查詢管理",             icon: "🛡️" },
      { label: "維修保養",   sub: "vehicles",    adminTab: undefined, desc: "維修保養記錄查詢",             icon: "🔧" },
      { label: "加油資料",   sub: "fuel",        adminTab: undefined, desc: "車輛加油記錄查詢",             icon: "⛽" },
    ],
  },
  {
    group: "報表統計",
    groupShort: "報表",
    accentColor: "#7c3aed",
    bgColor: "#faf5ff",
    badgeStyle: { background: "#ede9fe", color: "#5b21b6", borderColor: "#ddd6fe" },
    links: [
      { label: "車輛日業績", sub: "vehicles", adminTab: undefined, desc: "每日車輛出勤績效統計",            icon: "📊" },
      { label: "車輛月業績", sub: "vehicles", adminTab: undefined, desc: "每月車輛業績彙總",                icon: "📅" },
      { label: "油耗統計",   sub: "fuel",     adminTab: undefined, desc: "每月油耗統計報表",                icon: "⛽" },
      { label: "客戶日業績", sub: undefined,  adminTab: "report",  desc: "客戶每日業績統計",                icon: "👤" },
      { label: "客戶月業績", sub: undefined,  adminTab: "report",  desc: "客戶每月業績彙總",                icon: "📆" },
    ],
  },
];

const SUB_TABS: { id: SubTab; icon: string; label: string; desc: string; accentHex: string }[] = [
  { id: "glory_links",  icon: "🗂️", label: "功能總覽",  desc: "所有模組快速導覽", accentHex: "#4b5563" },
  { id: "vehicles",     icon: "🚛", label: "車輛管理",  desc: "車輛 CRUD、稅務",  accentHex: "#ea580c" },
  { id: "fuel",         icon: "⛽", label: "油料管理",  desc: "加油記錄報表",     accentHex: "#d97706" },
  { id: "driverbonus",  icon: "💰", label: "司機獎金",  desc: "獎金明細、發放",   accentHex: "#059669" },
  { id: "township",     icon: "🗺️", label: "鄉鎮市區",  desc: "22 縣市行政區",   accentHex: "#0284c7" },
  { id: "supplier",     icon: "🏭", label: "供應商",    desc: "供應商 CRUD",      accentHex: "#7c3aed" },
  { id: "contractquote",icon: "📝", label: "合約報價",  desc: "報價單管理",       accentHex: "#4f46e5" },
];

const TITLES: Record<SubTab, { title: string; subtitle: string }> = {
  vehicles:      { title: "🚛 車輛基本資料管理",  subtitle: "車輛資料、稅務、保險、eTag 維護查詢" },
  fuel:          { title: "⛽ 油料管理",           subtitle: "加油記錄、油料比較報表、油耗統計分析" },
  driverbonus:   { title: "💰 司機獎金管理",       subtitle: "司機獎金明細查詢與管理" },
  township:      { title: "🗺️ 鄉鎮市區資料",      subtitle: "台灣行政區域資料維護（已預載全台資料）" },
  supplier:      { title: "🏭 供應商管理",         subtitle: "供應商資料、聯絡人、服務區域、傭金率" },
  contractquote: { title: "📝 合約報價管理",       subtitle: "報價單建立與管理、路線費率、合約狀態" },
  glory_links:   { title: "🗂️ 功能總覽",          subtitle: "所有模組快速導覽，點擊直接進入對應功能" },
};

interface Props {
  initialSub?: SubTab;
  onNavigateAdmin?: (tab: string) => void;
}

export default function GloryPortalTab({ initialSub = "vehicles", onNavigateAdmin }: Props) {
  const [sub, setSub] = useState<SubTab>(initialSub);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const t = TITLES[sub];

  const filteredLinks = GLORY_LINKS.map(g => ({
    ...g,
    links: g.links.filter(l =>
      !search || l.label.includes(search) || l.desc.includes(search) || g.group.includes(search)
    ),
  })).filter(g => g.links.length > 0);

  function handleCardClick(link: GloryLink) {
    if (link.sub) setSub(link.sub);
    else if (link.adminTab && onNavigateAdmin) onNavigateAdmin(link.adminTab);
  }

  function cardTarget(link: GloryLink): "local" | "admin" | "none" {
    if (link.sub) return "local";
    if (link.adminTab && onNavigateAdmin) return "admin";
    return "none";
  }

  return (
    <div className="flex h-full min-h-0" style={{ gap: 0 }}>

      {/* ── 左側導覽 ── */}
      <div className="w-36 shrink-0 border-r flex flex-col py-3 gap-0.5" style={{ background: "#f8fafc" }}>
        <div className="px-3 pb-2">
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">後台管理中心</div>
          <button
            onClick={() => setImportOpen(true)}
            className="w-full flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
          >
            <span className="text-sm">📥</span> Glory 資料匯入
          </button>
        </div>

        {SUB_TABS.map(s => {
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 transition-all rounded-none"
              style={{
                background: active ? "#fff" : "transparent",
                borderLeft: active ? `3px solid ${s.accentHex}` : "3px solid transparent",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.07)" : "none",
              }}
            >
              <span className="text-base shrink-0">{s.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-tight truncate"
                  style={{ color: active ? s.accentHex : "#374151" }}>
                  {s.label}
                </div>
                <div className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: "#9ca3af" }}>
                  {s.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── 主內容區 ── */}
      <div className="flex-1 min-w-0 overflow-auto" style={{ background: "#f9fafb" }}>
        <div className="p-5">

          {/* 頁面標題 */}
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">{t.title}</h2>
              <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{t.subtitle}</p>
            </div>
          </div>

          {sub === "vehicles"     && <VehicleTab />}
          {sub === "fuel"         && <FuelTab />}
          {sub === "driverbonus"  && <DriverBonusTab />}
          {sub === "township"     && <TownshipTab />}
          {sub === "supplier"     && <SupplierTab />}
          {sub === "contractquote"&& <ContractQuoteTab />}

          {sub === "glory_links" && (
            <div className="space-y-5">

              {/* 搜尋框 */}
              <div className="flex items-center gap-3">
                <div className="relative w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#9ca3af" }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="搜尋功能模組..."
                    className="h-9 pl-9 pr-8 text-sm rounded-lg outline-none w-full transition"
                    style={{ border: "1px solid #e5e7eb", background: "#fff" }}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "#9ca3af" }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs" style={{ color: "#9ca3af" }}>
                  共 {GLORY_LINKS.reduce((a, g) => a + g.links.length, 0)} 個模組
                </span>
              </div>

              {filteredLinks.length === 0 ? (
                <div className="text-center py-12 text-sm rounded-xl" style={{ background: "#fff", border: "1px dashed #e5e7eb", color: "#9ca3af" }}>
                  找不到「{search}」相關功能
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLinks.map(group => (
                    <div key={group.group} className="rounded-xl overflow-hidden" style={{ border: "1px solid #e5e7eb", background: "#fff" }}>

                      {/* 分類標題列 */}
                      <div className="flex items-center gap-3 px-4 py-2.5"
                        style={{ background: group.bgColor, borderBottom: `1px solid ${group.badgeStyle.borderColor as string}` }}>
                        <div className="w-1.5 h-5 rounded-full" style={{ background: group.accentColor }} />
                        <span className="text-sm font-bold" style={{ color: group.accentColor }}>{group.group}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={group.badgeStyle}>
                          {group.links.filter(l => cardTarget(l) !== "none").length} 個功能
                        </span>
                      </div>

                      {/* 功能項目橫向排列 */}
                      <div className="p-3 flex flex-wrap gap-2">
                        {group.links.map(link => {
                          const target = cardTarget(link);
                          if (target === "none") return null;
                          const isAdmin = target === "admin";
                          return (
                            <button
                              key={link.label}
                              onClick={() => handleCardClick(link)}
                              title={link.desc}
                              className="group flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                              style={{
                                background: group.bgColor,
                                border: `1px solid ${group.badgeStyle.borderColor as string}`,
                                minWidth: "120px",
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px rgba(0,0,0,0.10)`;
                                (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.boxShadow = "none";
                                (e.currentTarget as HTMLElement).style.transform = "none";
                              }}
                            >
                              <span className="text-lg shrink-0">{link.icon}</span>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold leading-tight flex items-center gap-1" style={{ color: group.accentColor }}>
                                  {link.label}
                                  {isAdmin
                                    ? <ArrowUpRight className="w-3 h-3 opacity-60 shrink-0" />
                                    : <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
                                  }
                                </div>
                                <div className="text-[10px] leading-snug mt-0.5 max-w-[140px] truncate" style={{ color: "#6b7280" }}>
                                  {link.desc}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 底部 Glory 模組標記 */}
              <div className="flex items-center gap-2 pt-2">
                <div className="h-px flex-1" style={{ background: "#e5e7eb" }} />
                <span className="text-[11px] px-3 py-1 rounded-full font-medium flex items-center gap-1.5"
                  style={{ background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                  🖥️ Glory 模組
                </span>
                <div className="h-px flex-1" style={{ background: "#e5e7eb" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} defaultTab="suppliers" onSuccess={() => setImportOpen(false)} />
    </div>
  );
}
