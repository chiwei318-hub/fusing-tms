import { useState } from "react";
import { UserPlus, Building2, DollarSign } from "lucide-react";
import DriverApplicationsTab from "./DriverApplicationsTab";
import FranchiseeTab from "./FranchiseeTab";
import FranchiseSettlementTab from "./FranchiseSettlementTab";

type Inner = "join" | "franchisee" | "settlement";

const TABS: { value: Inner; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    value: "join",
    icon: <UserPlus className="w-4 h-4" />,
    label: "加盟審核",
    desc: "審核新加盟申請、司機資格審查",
  },
  {
    value: "franchisee",
    icon: <Building2 className="w-4 h-4 text-indigo-600" />,
    label: "加盟主管理",
    desc: "管理現有加盟車主帳號、合約、車輛",
  },
  {
    value: "settlement",
    icon: <DollarSign className="w-4 h-4 text-emerald-600" />,
    label: "加盟清算",
    desc: "抽成費率設定、月結清算、帳務對帳",
  },
];

export default function FranchiseHubTab() {
  const [inner, setInner] = useState<Inner>("join");

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🤝</span>
        <div>
          <h2 className="text-lg font-bold leading-tight">加盟管理中心</h2>
          <p className="text-xs text-muted-foreground">加盟審核 · 加盟主帳號 · 加盟清算</p>
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

      {inner === "join"       && <DriverApplicationsTab />}
      {inner === "franchisee" && <FranchiseeTab />}
      {inner === "settlement" && <FranchiseSettlementTab />}
    </div>
  );
}
