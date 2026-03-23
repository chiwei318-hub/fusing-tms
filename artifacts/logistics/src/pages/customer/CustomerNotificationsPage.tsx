import { useAuth } from "@/contexts/AuthContext";
import CustomerNotifications from "./CustomerNotifications";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function CustomerNotificationsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/customer">
          <button className="p-2 -ml-1 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">我的通知</h1>
          <p className="text-xs text-muted-foreground mt-0.5">訂單派車、運送狀態即時通知</p>
        </div>
      </div>

      {user?.id ? (
        <CustomerNotifications customerId={user.id} />
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          請先登入才能查看通知
        </div>
      )}
    </div>
  );
}
