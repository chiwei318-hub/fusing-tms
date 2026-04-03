import type { EnterpriseSession } from "@/components/EnterpriseLayout";
import ShopeeBillingTab from "@/pages/admin/ShopeeBillingTab";

interface Props {
  session: EnterpriseSession;
}

export default function EnterpriseShopeeImport({ session: _session }: Props) {
  return (
    <div className="min-h-[calc(100svh-7rem)]">
      <ShopeeBillingTab />
    </div>
  );
}
