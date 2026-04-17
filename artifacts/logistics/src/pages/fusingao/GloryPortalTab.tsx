import { useState } from "react";
import { Search, X, Upload, ArrowRight } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import VehicleTab    from "./VehicleTab";
import FuelTab       from "./FuelTab";
import DriverBonusTab from "./DriverBonusTab";
import TownshipTab   from "./TownshipTab";
import SupplierTab   from "./SupplierTab";
import ContractQuoteTab from "./ContractQuoteTab";

type SubTab = "vehicles" | "fuel" | "driverbonus" | "township" | "supplier" | "contractquote" | "glory_links";

interface GloryLink {
  label: string;
  sub?: SubTab;
  desc: string;
  icon: string;
}

interface GloryGroup {
  group: string;
  color: string;
  borderActive: string;
  links: GloryLink[];
}

const GLORY_LINKS: GloryGroup[] = [
  // ── 1. 基本資料 ──────────────────────────────────────────────────────────
  {
    group: "1. 基本資料",
    color: "border-blue-200 bg-blue-50 hover:bg-blue-100",
    borderActive: "border-blue-400",
    links: [
      {
        label: "客戶基本資料",
        sub: undefined,
        desc: "所有客戶資料查詢、匯出 Excel",
        icon: "👤",
      },
      {
        label: "廠商基本資料",
        sub: "supplier",
        desc: "廠商編號、廠商名稱、聯絡人、電話、統編、地址",
        icon: "🏭",
      },
      {
        label: "車輛基本資料",
        sub: "vehicles",
        desc: "車號、車牌、車型、出廠年月、最大載重、卡車廠牌",
        icon: "🚛",
      },
      {
        label: "縣市基本資料",
        sub: "township",
        desc: "縣市代碼、縣市名稱（KLUNG / YILAN / TPE1…）",
        icon: "🏙️",
      },
      {
        label: "鄉鎮基本資料",
        sub: "township",
        desc: "鄉鎮代碼、鄉鎮名稱、所屬縣市（100臺北市中正區…）",
        icon: "🗺️",
      },
      {
        label: "報價車型設定",
        sub: "contractquote",
        desc: "車輛類型代碼：0.6T / 1.5T / 3.5T … 43T",
        icon: "🚚",
      },
      {
        label: "配眼客戶",
        sub: undefined,
        desc: "起點地址 ↔ 終點地址，預測行駛距離 / 時數對應",
        icon: "📍",
      },
    ],
  },
  // ── 2. 報價作業 ───────────────────────────────────────────────────────────
  {
    group: "2. 報價作業",
    color: "border-amber-200 bg-amber-50 hover:bg-amber-100",
    borderActive: "border-amber-400",
    links: [
      {
        label: "報價單維護",
        sub: "contractquote",
        desc: "報價單新增、編輯、維護管理",
        icon: "✏️",
      },
      {
        label: "報價基準區",
        sub: "contractquote",
        desc: "報價單號、客戶編號、報價日期、生效日期區間查詢",
        icon: "📋",
      },
      {
        label: "報價主管理",
        sub: "contractquote",
        desc: "報價單主清單：報價單號、客戶、生效日期、現場日期",
        icon: "📝",
      },
      {
        label: "範例結算緣線",
        sub: "contractquote",
        desc: "報價緣線結算範例條件說明",
        icon: "📐",
      },
    ],
  },
  // ── 3. 訂單作業 ───────────────────────────────────────────────────────────
  {
    group: "3. 訂單作業",
    color: "border-green-200 bg-green-50 hover:bg-green-100",
    borderActive: "border-green-400",
    links: [
      {
        label: "訂單維護",
        sub: undefined,
        desc: "訂單新增、編輯、維護管理",
        icon: "✏️",
      },
      {
        label: "回單批價",
        sub: undefined,
        desc: "回單批價作業查詢與管理",
        icon: "💲",
      },
      {
        label: "外包運費",
        sub: undefined,
        desc: "外包車輛運費查詢與管理",
        icon: "🚐",
      },
      {
        label: "代墊款",
        sub: undefined,
        desc: "代墊款查詢與管理",
        icon: "💴",
      },
      {
        label: "運費校對單",
        sub: undefined,
        desc: "運費校對單查詢與管理",
        icon: "🔍",
      },
      {
        label: "運費請款單",
        sub: undefined,
        desc: "運費請款單建立與查詢",
        icon: "🧾",
      },
      {
        label: "訂單查詢",
        sub: undefined,
        desc: "訂單編號、客戶編號、日期區間、車型、路線查詢",
        icon: "📦",
      },
    ],
  },
  // ── 4. 派遣作業 ───────────────────────────────────────────────────────────
  {
    group: "4. 派遣作業",
    color: "border-orange-200 bg-orange-50 hover:bg-orange-100",
    borderActive: "border-orange-400",
    links: [
      {
        label: "訂單派遣",
        sub: undefined,
        desc: "訂單派遣查詢與管理",
        icon: "📋",
      },
      {
        label: "車輛總覽",
        sub: "vehicles",
        desc: "車輛即時狀態總覽",
        icon: "🚛",
      },
      {
        label: "貨況追蹤",
        sub: undefined,
        desc: "貨物即時狀態追蹤查詢",
        icon: "📍",
      },
      {
        label: "派遣收據查詢",
        sub: undefined,
        desc: "派遣收據單號、日期、車輛、司機查詢",
        icon: "🧾",
      },
    ],
  },
  // ── 5. 管理作業 ───────────────────────────────────────────────────────────
  {
    group: "5. 管理作業",
    color: "border-rose-200 bg-rose-50 hover:bg-rose-100",
    borderActive: "border-rose-400",
    links: [
      {
        label: "司機日報表",
        sub: "driverbonus",
        desc: "司機每日出勤與業績日報表",
        icon: "🧑‍✈️",
      },
      {
        label: "車輛稅費",
        sub: "vehicles",
        desc: "車輛稅費查詢與管理",
        icon: "🧾",
      },
      {
        label: "車輛保險",
        sub: "vehicles",
        desc: "車輛保險查詢與管理",
        icon: "🛡️",
      },
      {
        label: "維修保養",
        sub: "vehicles",
        desc: "車輛維修保養記錄查詢與管理",
        icon: "🔧",
      },
      {
        label: "加油資料",
        sub: "fuel",
        desc: "車輛加油記錄查詢與管理",
        icon: "⛽",
      },
    ],
  },
  // ── 6. 報表 ───────────────────────────────────────────────────────────────
  {
    group: "6. 報表",
    color: "border-purple-200 bg-purple-50 hover:bg-purple-100",
    borderActive: "border-purple-400",
    links: [
      {
        label: "車輛日業績表",
        sub: "vehicles",
        desc: "每日車輛出勤績效、行駛距離、趟次統計",
        icon: "📊",
      },
      {
        label: "車輛月業績表",
        sub: "vehicles",
        desc: "車輛每月業績彙總統計報表",
        icon: "📅",
      },
      {
        label: "油耗統計表",
        sub: "fuel",
        desc: "每月油耗統計報表",
        icon: "⛽",
      },
      {
        label: "客戶日業績表",
        sub: undefined,
        desc: "客戶每日業績統計報表",
        icon: "👤",
      },
      {
        label: "客戶月業績表",
        sub: undefined,
        desc: "客戶每月業績彙總統計報表",
        icon: "📆",
      },
    ],
  },
];

const SUB_TABS: { id: SubTab; icon: string; label: string; desc: string; color: string }[] = [
  { id:"vehicles",      icon:"🚛", label:"車輛管理",   desc:"車輛 CRUD、稅務 / 保險 / eTag", color:"text-orange-600 border-orange-500" },
  { id:"fuel",          icon:"⛽", label:"油料管理",   desc:"加油記錄 + 比較報表",            color:"text-amber-600 border-amber-500"  },
  { id:"driverbonus",   icon:"💰", label:"司機獎金",   desc:"獎金明細、標記發放",             color:"text-emerald-600 border-emerald-500" },
  { id:"township",      icon:"🗺️", label:"鄉鎮市區",   desc:"22 縣市行政區資料",              color:"text-sky-600 border-sky-500"     },
  { id:"supplier",      icon:"🏭", label:"供應商管理", desc:"供應商 CRUD、銀行 / 傭金",        color:"text-purple-600 border-purple-500" },
  { id:"contractquote", icon:"📝", label:"合約報價",   desc:"報價單管理、路線費率",            color:"text-indigo-600 border-indigo-500" },
  { id:"glory_links",   icon:"🗂️", label:"功能總覽",   desc:"所有模組快速導覽入口",            color:"text-gray-600 border-gray-500"   },
];

const TITLES: Record<SubTab,{title:string;subtitle:string}> = {
  vehicles:      { title:"🚛 車輛基本資料管理", subtitle:"車輛資料、稅務、保險、eTag 維護查詢" },
  fuel:          { title:"⛽ 油料管理",          subtitle:"加油記錄、油料比較報表、油耗統計分析" },
  driverbonus:   { title:"💰 司機獎金管理",     subtitle:"司機獎金明細查詢與管理" },
  township:      { title:"🗺️ 鄉鎮市區資料",     subtitle:"台灣行政區域資料維護（已預載全台資料）" },
  supplier:      { title:"🏭 供應商管理",        subtitle:"供應商資料、聯絡人、服務區域、傭金率" },
  contractquote: { title:"📝 合約報價管理",      subtitle:"報價單建立與管理、路線費率、合約狀態" },
  glory_links:   { title:"🗂️ 功能總覽", subtitle:"所有管理模組快速導覽入口" },
};

interface Props {
  initialSub?: SubTab;
}

export default function GloryPortalTab({ initialSub = "vehicles" }: Props) {
  const [sub, setSub] = useState<SubTab>(initialSub);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const t = TITLES[sub];

  const filteredLinks = GLORY_LINKS.map(g => ({
    ...g,
    links: g.links.filter(l =>
      !search ||
      l.label.includes(search) ||
      l.desc.includes(search) ||
      g.group.includes(search)
    ),
  })).filter(g => g.links.length > 0);

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* ── 左側子頁籤 ───────────────────────────────────────────────── */}
      <div className="w-40 shrink-0 border-r bg-muted/20 flex flex-col py-2 gap-0.5">
        <div className="px-3 pb-2 pt-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">後台管理中心</div>
          <button
            onClick={() => setImportOpen(true)}
            className="mt-2 w-full flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
          >
            <Upload className="w-3 h-3 shrink-0" />
            Glory 資料匯入
          </button>
        </div>
        {SUB_TABS.map(s => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-all rounded-none border-l-2 hover:bg-muted/40 ${
              sub === s.id
                ? `bg-white ${s.color} border-l-[3px] shadow-sm`
                : "border-l-transparent text-gray-600"
            }`}
          >
            <span className="text-base shrink-0 leading-tight">{s.icon}</span>
            <div className="min-w-0">
              <div className={`text-xs font-semibold leading-tight ${sub === s.id ? s.color.split(" ")[0] : ""}`}>{s.label}</div>
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{s.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── 右側內容區 ───────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="p-4">
          {/* Header */}
          <div className="mb-4">
            <h2 className="text-base font-bold flex items-center gap-2">{t.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t.subtitle}</p>
          </div>

          {sub === "vehicles"      && <VehicleTab />}
          {sub === "fuel"          && <FuelTab />}
          {sub === "driverbonus"   && <DriverBonusTab />}
          {sub === "township"      && <TownshipTab />}
          {sub === "supplier"      && <SupplierTab />}
          {sub === "contractquote" && <ContractQuoteTab />}

          {sub === "glory_links" && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜尋功能..."
                  className="h-8 pl-9 pr-7 text-sm bg-card border rounded-md outline-none w-full focus:ring-2 focus:ring-primary/30 transition"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {filteredLinks.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border rounded-lg text-sm">找不到「{search}」相關功能</div>
              ) : (
                <div className="space-y-4">
                  {filteredLinks.map(group => (
                    <div key={group.group}>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.group}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {group.links.map(link => {
                          const isAvailable = !!link.sub;
                          if (isAvailable) {
                            return (
                              <button
                                key={link.label}
                                onClick={() => setSub(link.sub!)}
                                className={`group flex items-start gap-3 p-3 rounded-lg border text-left w-full ${group.color} hover:shadow-md hover:scale-[1.01] transition-all`}
                              >
                                <span className="text-2xl shrink-0 mt-0.5">{link.icon}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-sm truncate">{link.label}</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{link.desc}</div>
                                </div>
                              </button>
                            );
                          }
                          return (
                            <div
                              key={link.label}
                              className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                            >
                              <span className="text-2xl shrink-0 mt-0.5 grayscale">{link.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-sm truncate text-gray-500">{link.label}</span>
                                  <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-medium shrink-0">建置中</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{link.desc}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultTab="suppliers"
        onSuccess={() => setImportOpen(false)}
      />
    </div>
  );
}
