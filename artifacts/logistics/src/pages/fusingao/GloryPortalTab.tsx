import { useState } from "react";
import { Search, X, Upload, ChevronRight, ArrowUpRight } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import VehicleTab from "./VehicleTab";
import FuelTab from "./FuelTab";
import DriverBonusTab from "./DriverBonusTab";
import TownshipTab from "./TownshipTab";
import SupplierTab from "./SupplierTab";
import ContractQuoteTab from "./ContractQuoteTab";
import ShopeeDriversTab from "./ShopeeDriversTab";
import ShopeeScheduleTab from "./ShopeeScheduleTab";

type SubTab = "vehicles" | "fuel" | "driverbonus" | "township" | "supplier" | "contractquote" | "glory_links" | "shopeedrivers" | "shopeeschedule";

interface GloryLink {
  label: string;
  sub?: SubTab;
  adminTab?: string;
  desc: string;
  icon: string;
}

interface GloryGroup {
  group: string;
  accent: string;
  bg: string;
  border: string;
  labelStyle: React.CSSProperties;
  links: GloryLink[];
}

// ── 整合後的 4 大分類（去除重複）────────────────────────────────────────────
const GLORY_LINKS: GloryGroup[] = [
  {
    group: "基本資料",
    accent: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
    labelStyle: { background: "#dbeafe", color: "#1d4ed8" },
    links: [
      { label: "客戶資料",    adminTab: "customers",  desc: "客戶查詢、匯出 Excel",          icon: "👤" },
      { label: "廠商資料",   sub: "supplier",         desc: "廠商編號、聯絡人、統編、地址", icon: "🏭" },
      { label: "車輛資料",   sub: "vehicles",         desc: "車號、車型、出廠年月、載重",   icon: "🚛" },
      { label: "縣市鄉鎮",  sub: "township",          desc: "縣市代碼與鄉鎮行政區維護",    icon: "🗺️" },
      { label: "供應商",    sub: "supplier",           desc: "供應商 CRUD、銀行傭金",        icon: "🏗️" },
      { label: "蝦皮司機",  sub: "shopeedrivers",     desc: "蝦皮小楊車隊司機名單、聯絡資料", icon: "🧑‍✈️" },
      { label: "自動化客服", adminTab: "line",         desc: "RAG 處理司機與客戶 FAQ",      icon: "🤖" },
    ],
  },
  {
    group: "報價 & 訂單",
    accent: "#059669",
    bg: "#f0fdf4",
    border: "#a7f3d0",
    labelStyle: { background: "#dcfce7", color: "#065f46" },
    links: [
      { label: "合約報價單",  sub: "contractquote",     desc: "報價單新增、編輯、維護",         icon: "📝" },
      { label: "報價查詢",    sub: "contractquote",     desc: "報價單號、客戶、生效日期查詢",   icon: "📋" },
      { label: "訂單維護",    adminTab: "orders",       desc: "訂單新增、編輯、管理",           icon: "✏️" },
      { label: "訂單查詢",    adminTab: "order-search", desc: "日期區間、車型、路線查詢",       icon: "📦" },
      { label: "回單批價",    adminTab: "settlement",   desc: "回單批價作業查詢",               icon: "💲" },
      { label: "外包運費",    adminTab: "outsourcing",  desc: "外包車輛運費管理",               icon: "🚐" },
      { label: "代墊款",      adminTab: "invoice",      desc: "代墊款建立查詢",                 icon: "💴" },
      { label: "運費請款",    adminTab: "invoice",      desc: "請款單建立查詢",                 icon: "🧾" },
    ],
  },
  {
    group: "派遣 & 車隊",
    accent: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
    labelStyle: { background: "#ffedd5", color: "#9a3412" },
    links: [
      { label: "訂單派遣",     adminTab: "dispatch", desc: "即時派遣查詢管理",           icon: "📋" },
      { label: "車輛即時總覽", sub: "vehicles",      desc: "車輛狀態即時監控",           icon: "🖥️" },
      { label: "貨況追蹤",     adminTab: "smart",    desc: "貨物即時狀態追蹤",           icon: "📍" },
      { label: "動態排程優化", adminTab: "smart",    desc: "AI 分析交通、優化派單邏輯",  icon: "🧠" },
      { label: "派遣收據",     adminTab: "orders",   desc: "收據單號、日期、車輛查詢",   icon: "🗄️" },
      { label: "車輛加油",     sub: "fuel",          desc: "加油記錄查詢管理",           icon: "⛽" },
    ],
  },
  {
    group: "報表 & 統計",
    accent: "#7c3aed",
    bg: "#faf5ff",
    border: "#ddd6fe",
    labelStyle: { background: "#ede9fe", color: "#5b21b6" },
    links: [
      { label: "司機日報表",   sub: "driverbonus", desc: "司機每日出勤與業績",        icon: "🧑‍✈️" },
      { label: "車輛業績報表", sub: "vehicles",    desc: "車輛日月業績統計",          icon: "📊" },
      { label: "油耗統計",     sub: "fuel",        desc: "每月油耗報表",              icon: "⛽" },
      { label: "客戶業績報表", adminTab: "report", desc: "客戶日月業績統計",          icon: "📆" },
      { label: "財務結算",     adminTab: "settlement", desc: "結算、折解、閉環查詢", icon: "💰" },
      { label: "車輛維護",     sub: "vehicles",    desc: "稅費、保險、維修保養記錄",  icon: "🔧" },
    ],
  },
];

// ── 左側導覽 subtabs ──────────────────────────────────────────────────────────
const SUB_TABS: { id: SubTab; icon: string; label: string; accent: string }[] = [
  { id: "glory_links",    icon: "🗂️", label: "功能總覽",   accent: "#4b5563" },
  { id: "shopeedrivers",  icon: "🧑‍✈️", label: "蝦皮司機名單", accent: "#0284c7" },
  { id: "shopeeschedule", icon: "📅", label: "蝦皮班表",    accent: "#7c3aed" },
  { id: "contractquote",  icon: "📝", label: "合約報價",   accent: "#4f46e5" },
  { id: "vehicles",       icon: "🚛", label: "車輛管理",   accent: "#ea580c" },
  { id: "fuel",           icon: "⛽", label: "油料管理",   accent: "#d97706" },
  { id: "driverbonus",    icon: "💰", label: "司機獎金",   accent: "#059669" },
  { id: "township",       icon: "🗺️", label: "縣市鄉鎮",  accent: "#0ea5e9" },
  { id: "supplier",       icon: "🏭", label: "供應商",     accent: "#7c3aed" },
];

const TITLES: Record<SubTab, { title: string; subtitle: string }> = {
  glory_links:      { title: "🗂️ 功能總覽",          subtitle: "所有模組快速導覽，點擊直接進入對應功能" },
  shopeedrivers:    { title: "🧑‍✈️ 蝦皮司機名單",     subtitle: "蝦皮小楊車隊司機聯絡資料、身分證、車籍管理" },
  shopeeschedule:   { title: "📅 蝦皮北倉班表",        subtitle: "路線派車班表：WH NDD / 快速到貨 / 流水線，即時刷新" },
  contractquote:  { title: "📝 合約報價管理",       subtitle: "報價單建立、管理、路線費率、合約狀態" },
  vehicles:       { title: "🚛 車輛管理",           subtitle: "車輛資料、稅務、保險、維修、eTag 維護查詢" },
  fuel:           { title: "⛽ 油料管理",            subtitle: "加油記錄、油耗比較報表、月統計分析" },
  driverbonus:    { title: "💰 司機獎金管理",       subtitle: "司機獎金明細查詢與發放管理" },
  township:       { title: "🗺️ 縣市鄉鎮資料",      subtitle: "台灣行政區域資料維護（已預載全台資料）" },
  supplier:       { title: "🏭 供應商管理",         subtitle: "供應商資料、聯絡人、服務區域、傭金率" },
};

interface Props {
  initialSub?: SubTab;
  onNavigateAdmin?: (tab: string) => void;
}

export default function GloryPortalTab({ initialSub = "glory_links", onNavigateAdmin }: Props) {
  const [sub, setSub] = useState<SubTab>(initialSub);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const t = TITLES[sub];

  const filteredGroups = GLORY_LINKS.map(g => ({
    ...g,
    links: g.links.filter(l =>
      !search || l.label.includes(search) || l.desc.includes(search) || g.group.includes(search)
    ),
  })).filter(g => g.links.length > 0);

  function handleCardClick(link: GloryLink) {
    if (link.sub) setSub(link.sub);
    else if (link.adminTab && onNavigateAdmin) onNavigateAdmin(link.adminTab);
  }

  function isAdmin(link: GloryLink) {
    return !link.sub && !!link.adminTab;
  }

  return (
    <div className="flex h-full min-h-0" style={{ gap: 0 }}>

      {/* ── 左側導覽 ── */}
      <div className="w-36 shrink-0 border-r flex flex-col py-3 gap-0.5" style={{ background: "#f8fafc" }}>
        <div className="px-3 pb-2">
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9ca3af" }}>後台管理中心</div>
          <button
            onClick={() => setImportOpen(true)}
            className="w-full flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
          >
            <Upload className="w-3 h-3 shrink-0" /> Glory 資料匯入
          </button>
        </div>

        {SUB_TABS.map(s => {
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 transition-all"
              style={{
                background: active ? "#fff" : "transparent",
                borderLeft: `3px solid ${active ? s.accent : "transparent"}`,
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.07)" : "none",
              }}
            >
              <span className="text-base shrink-0 leading-none">{s.icon}</span>
              <span className="text-xs font-semibold truncate" style={{ color: active ? s.accent : "#374151" }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 主內容 ── */}
      <div className="flex-1 min-w-0 overflow-auto" style={{ background: "#f9fafb" }}>
        <div className="p-5">

          {/* 頁面標題 */}
          <div className="mb-4">
            <h2 className="text-base font-bold" style={{ color: "#111827" }}>{t.title}</h2>
            <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{t.subtitle}</p>
          </div>

          {/* ── 各頁面內容 ── */}
          {sub === "shopeedrivers"  && <ShopeeDriversTab />}
          {sub === "shopeeschedule" && <ShopeeScheduleTab />}
          {sub === "contractquote" && <ContractQuoteTab />}
          {sub === "vehicles"      && <VehicleTab />}
          {sub === "fuel"          && <FuelTab />}
          {sub === "driverbonus"   && <DriverBonusTab />}
          {sub === "township"      && <TownshipTab />}
          {sub === "supplier"      && <SupplierTab />}

          {/* ── 功能總覽 ── */}
          {sub === "glory_links" && (
            <div className="space-y-4">

              {/* 搜尋列 */}
              <div className="flex items-center gap-3">
                <div className="relative w-52">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#9ca3af" }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="搜尋功能..."
                    className="h-9 pl-9 pr-8 text-sm rounded-lg outline-none w-full"
                    style={{ border: "1px solid #e5e7eb", background: "#fff" }}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "#9ca3af" }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs" style={{ color: "#9ca3af" }}>
                  {GLORY_LINKS.reduce((a, g) => a + g.links.length, 0)} 個功能模組
                </span>
              </div>

              {filteredGroups.length === 0 ? (
                <div className="text-center py-12 text-sm rounded-xl" style={{ background: "#fff", border: "1px dashed #e5e7eb", color: "#9ca3af" }}>
                  找不到「{search}」相關功能
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredGroups.map(group => (
                    <div key={group.group} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid ${group.border}`, background: "#fff" }}>

                      {/* 分類標題 */}
                      <div className="flex items-center gap-2 px-4 py-2.5"
                        style={{ background: group.bg, borderBottom: `1px solid ${group.border}` }}>
                        <div className="w-1 h-4 rounded-full" style={{ background: group.accent }} />
                        <span className="text-sm font-bold" style={{ color: group.accent }}>{group.group}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium ml-1"
                          style={{ ...group.labelStyle, border: `1px solid ${group.border}` }}>
                          {group.links.length}
                        </span>
                      </div>

                      {/* 功能 Chips */}
                      <div className="p-3 flex flex-wrap gap-2">
                        {group.links.map(link => (
                          <button
                            key={link.label}
                            onClick={() => handleCardClick(link)}
                            title={link.desc}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                            style={{
                              background: group.bg,
                              border: `1px solid ${group.border}`,
                              minWidth: "108px",
                              maxWidth: "160px",
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 10px rgba(0,0,0,0.10)";
                              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.boxShadow = "none";
                              (e.currentTarget as HTMLElement).style.transform = "none";
                            }}
                          >
                            <span className="text-xl shrink-0 leading-none">{link.icon}</span>
                            <div className="min-w-0">
                              <div className="text-[12px] font-bold leading-tight flex items-center gap-0.5"
                                style={{ color: group.accent }}>
                                {link.label}
                                {isAdmin(link)
                                  ? <ArrowUpRight className="w-3 h-3 shrink-0 opacity-50" />
                                  : <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />}
                              </div>
                              <div className="text-[10px] leading-snug mt-0.5 truncate"
                                style={{ color: "#6b7280", maxWidth: "110px" }}>
                                {link.desc}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Glory 模組標記 */}
              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1" style={{ background: "#e5e7eb" }} />
                <span className="text-[11px] px-3 py-0.5 rounded-full" style={{ background: "#f3f4f6", color: "#9ca3af", border: "1px solid #e5e7eb" }}>
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
