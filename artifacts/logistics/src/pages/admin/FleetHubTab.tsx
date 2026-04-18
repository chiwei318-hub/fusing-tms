import { useState } from "react";
import { Bell, Building2 } from "lucide-react";
import FleetManagementTab from "./FleetManagementTab";
import FleetRegistrationTab from "./FleetRegistrationTab";

type Inner = "manage" | "register";

const TABS: { value: Inner; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    value: "manage",
    icon: <Bell className="w-4 h-4" />,
    label: "車隊管理",
    desc: "查看車隊成員、車輛狀態、即時位置通知",
  },
  {
    value: "register",
    icon: <Building2 className="w-4 h-4 text-blue-600" />,
    label: "車隊入駐",
    desc: "非靠行車輛申請入駐、車隊帳號建立、資格審核",
  },
];

export default function FleetHubTab() {
  const [inner, setInner] = useState<Inner>("manage");

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🚛</span>
        <div>
          <h2 className="text-lg font-bold leading-tight">車隊中心</h2>
          <p className="text-xs text-muted-foreground">車隊管理 · 車隊入駐（非靠行自有車輛）</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border mb-6 overflow-x-auto pb-0">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setInner(t.value)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
              inner === t.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
            ].join(" ")}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground mb-4">
        {TABS.find(t => t.value === inner)?.desc}
      </div>

      {inner === "manage"   && <FleetManagementTab />}
      {inner === "register" && <FleetRegistrationTab />}
    </div>
  );
}
