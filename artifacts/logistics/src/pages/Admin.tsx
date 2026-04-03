import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImportDialog } from "@/components/ImportDialog";
import { OnlineUsersPanel } from "@/components/OnlineUsersPanel";
import { QuickOrderPanel } from "@/components/QuickOrderPanel";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package, Truck, UserPlus, Settings2, Trash2, BarChart2,
  TrendingUp, Clock, CheckCircle, XCircle, DollarSign, Users, ClipboardList,
  Pencil, MessageCircle, MessageCircleOff, Eye, EyeOff, Info, Zap, Calculator,
  Layers, Map, Brain, Navigation, Car, Save, Plus, MapPin, Bell, Shield, Upload,
  Search, X, Building2, Trophy, Star, AlertTriangle, Percent, KeyRound, FileText, Globe,
  RotateCcw, RefreshCw, Tag,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import VehicleTypeTab from "./admin/VehicleTypeTab";
import ReportCenter from "./admin/ReportCenter";
import FinanceReportsTab from "./admin/FinanceReportsTab";
import AdminHome from "./admin/AdminHome";
import SmartDispatchTab from "./admin/SmartDispatchTab";
import DispatchOptimizerTab from "./admin/DispatchOptimizerTab";
import DriverApplicationsTab from "./admin/DriverApplicationsTab";
import CustomerManagementTab from "./admin/CustomerManagementTab";
import HeatMapTab from "./admin/HeatMapTab";
import AIAnalyticsTab from "./admin/AIAnalyticsTab";
import FleetMapTab from "./admin/FleetMapTab";
import CarpoolTab from "./admin/CarpoolTab";
import FleetManagementTab from "./admin/FleetManagementTab";
import OutsourcingTab from "./admin/OutsourcingTab";
import PaymentCenter from "./admin/PaymentCenter";
import QuotationTab from "./admin/QuotationTab";
import QuotesTab from "./admin/QuotesTab";
import RoutePriceTab from "./admin/RoutePriceTab";
import VehicleCostTab from "./admin/VehicleCostTab";
import PermissionTab from "./admin/PermissionTab";
import LineManagementTab from "./admin/LineManagementTab";
import SystemSettingsTab from "./admin/SystemSettingsTab";
import InvoiceManagementTab from "./admin/InvoiceManagementTab";
import BiddingTab from "./admin/BiddingTab";
import FleetRegistrationTab from "./admin/FleetRegistrationTab";
import PerformanceAuditTab from "./admin/PerformanceAuditTab";
import CarbonReportTab from "./admin/CarbonReportTab";
import KPIDashboardTab from "./admin/KPIDashboardTab";
import { SmartDatePicker } from "@/components/SmartDatePicker";
import ApprovalCenterTab from "./admin/ApprovalCenterTab";
import SettlementCenterTab from "./admin/SettlementCenterTab";
import AuditLogTab from "./admin/AuditLogTab";
import CostAnalysisTab from "./admin/CostAnalysisTab";
import { DemandForecastTab } from "./admin/DemandForecastTab";
import { ZoneManagementTab } from "./admin/ZoneManagementTab";
import { DailyOpsTab } from "./admin/DailyOpsTab";
import { AutoRoutingTab } from "./admin/AutoRoutingTab";
import RouteImportTab from "./admin/RouteImportTab";
import FormImportTab from "./admin/FormImportTab";
import SheetSyncTab from "./admin/SheetSyncTab";
import FranchiseeTab from "./admin/FranchiseeTab";
import PenaltiesTab from "./admin/PenaltiesTab";
import ShopeeRatesTab from "./admin/ShopeeRatesTab";
import DriverEarningsTab from "./admin/DriverEarningsTab";
import PnLTab from "./admin/PnLTab";
import CashFlowTab from "./admin/CashFlowTab";
import OpenApiTab from "./admin/OpenApiTab";
import BillingFlowTab from "./admin/BillingFlowTab";
import PricingPanel from "@/components/PricingPanel";
import { useOrdersData, useUpdateOrderMutation, useDeleteOrderMutation } from "@/hooks/use-orders";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDriversData, useCreateDriverMutation, useUpdateDriverMutation, useDeleteDriverMutation } from "@/hooks/use-drivers";
import { useCustomersData, useCreateCustomerMutation, useUpdateCustomerMutation, useDeleteCustomerMutation } from "@/hooks/use-customers";
import { OrderStatusBadge, DriverStatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import HistoryInput from "@/components/HistoryInput";
import { TaiwanAddressInput } from "@/components/TaiwanAddressInput";
import { useToast } from "@/hooks/use-toast";
import type { OrderStatus, DriverStatus, Driver, Customer, Order } from "@workspace/api-client-react";

const DRIVER_TYPE_LABELS: Record<string, string> = {
  self: "自有司機",
  affiliated: "靠行司機",
  external: "外車司機",
};

function calculateAutoQuote(order: Order): number {
  let total = 1500;
  const vehicleFees: Record<string, number> = {
    "小貨車": 0, "中型貨車": 800, "大貨車": 2000,
    "曳引車": 5000, "冷藏車": 3000, "不限": 0,
  };
  total += vehicleFees[order.requiredVehicleType ?? ""] ?? 0;
  const w = order.cargoWeight ?? 0;
  if (w > 300) total += 4000;
  else if (w > 100) total += 2000;
  else if (w > 50) total += 1000;
  else if (w > 10) total += 500;
  if (order.needTailgate === "yes") total += 500;
  if (order.needHydraulicPallet === "yes") total += 800;
  return total;
}

const driverFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  phone: z.string().min(8, "電話必填"),
  vehicleType: z.string().min(1, "車型必填"),
  licensePlate: z.string().min(3, "車牌必填"),
  driverType: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  lineUserId: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountName: z.string().optional(),
  vehicleBrand: z.string().optional(),
  vehicleYear: z.string().optional(),
  vehicleTonnage: z.string().optional(),
  hasTailgate: z.boolean().optional(),
  maxLoadKg: z.string().optional(),
  maxVolumeCbm: z.string().optional(),
});
type DriverFormValues = z.infer<typeof driverFormSchema>;

const customerFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  shortName: z.string().optional(),
  phone: z.string().min(8, "電話必填"),
  email: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  contactPerson: z.string().optional(),
  taxId: z.string().optional(),
  industry: z.string().optional(),
  paymentType: z.string().optional(),
  monthlyStatementDay: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  invoiceTitle: z.string().optional(),
  companyAddress: z.string().optional(),
  factoryAddress: z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerFormSchema>;

const extraStopEditSchema = z.object({
  address:     z.string().min(3, "請填寫地址"),
  contactName: z.string().optional(),
  phone:       z.string().optional(),
  company:     z.string().optional(),
  notes:       z.string().optional(),
  quantity:    z.string().optional(),
  weight:      z.coerce.number().optional(),
  signStatus:  z.enum(["pending", "signed"]).optional(),
});

const orderEditSchema = z.object({
  pickupDate: z.string().optional(),
  pickupTime: z.string().min(1, "請填寫取貨時間"),
  pickupAddress: z.string().min(5, "請填寫取貨地址"),
  pickupCompany: z.string().optional(),
  pickupContactPersonName: z.string().optional(),
  pickupContactPersonPhone: z.string().optional(),
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().min(1, "請填寫送達時間"),
  deliveryAddress: z.string().min(5, "請填寫送貨地址"),
  deliveryCompany: z.string().optional(),
  deliveryContactPersonName: z.string().optional(),
  deliveryContactPersonPhone: z.string().optional(),
  requiredVehicleType: z.string().optional(),
  cargoWeight: z.coerce.number().optional(),
  cargoLengthM: z.coerce.number().optional(),
  cargoWidthM: z.coerce.number().optional(),
  cargoHeightM: z.coerce.number().optional(),
  specialRequirements: z.string().optional(),
  notes: z.string().optional(),
  extraDeliveryStops: z.array(extraStopEditSchema).optional(),
});
type OrderEditValues = z.infer<typeof orderEditSchema>;

function parseContactPerson(cp: string | null | undefined): { name: string; phone: string } {
  if (!cp) return { name: "", phone: "" };
  const parts = cp.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^0\d{7,9}$/.test(last.replace(/-/g, ""))) {
    return { name: parts.slice(0, -1).join(" "), phone: last };
  }
  return { name: cp, phone: "" };
}

function parseExtraStops(raw: unknown): Array<{ address: string; contactName?: string; phone?: string; company?: string; notes?: string; quantity?: string; weight?: number; signStatus?: "pending" | "signed" }> {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待派車",
  assigned: "已派車",
  in_transit: "運送中",
  delivered: "已完成",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-100 text-blue-700",
  in_transit: "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</p>
            <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`${color} p-2.5 rounded-xl shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordInput({ field }: { field: React.InputHTMLAttributes<HTMLInputElement> & { value?: string } }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} {...field} value={field.value ?? ""} />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function DriverFormFields({ form, isEdit }: { form: ReturnType<typeof useForm<DriverFormValues>>; isEdit?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row gap-5">
      {/* ── 左欄：基本資料 + 車輛規格 ── */}
      <div className="flex-1 space-y-4">
        {/* 基本資料 */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">基本資料</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-xs">姓名 <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="例如：陳大文" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-xs">電話 <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="09xx-xxx-xxx" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="driverType" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-xs">司機類型</FormLabel>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇司機類型" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="self">自有司機</SelectItem>
                    <SelectItem value="affiliated">靠行司機</SelectItem>
                    <SelectItem value="external">外車司機</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">帳號</FormLabel>
                <FormControl><Input placeholder="登入帳號" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">密碼</FormLabel>
                <FormControl><PasswordInput field={field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {/* 車輛規格 */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">車輛規格</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="vehicleType" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">車型 <span className="text-destructive">*</span></FormLabel>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇車型" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="廂式">廂式</SelectItem>
                    <SelectItem value="棚式">棚式</SelectItem>
                    <SelectItem value="平斗">平斗</SelectItem>
                    <SelectItem value="歐翼">歐翼</SelectItem>
                    <SelectItem value="其他">其他</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="licensePlate" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">車牌 <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="ABC-1234" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="vehicleBrand" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">廠牌</FormLabel>
                <FormControl><Input placeholder="HINO、三菱…" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="vehicleYear" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">出廠年份</FormLabel>
                <FormControl><Input type="number" placeholder="2020" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="vehicleTonnage" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">噸位</FormLabel>
                <FormControl><Input placeholder="3.5T、5T…" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="hasTailgate" render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0 pt-5">
                <FormControl>
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-primary"
                    checked={field.value ?? false}
                    onChange={e => field.onChange(e.target.checked)}
                  />
                </FormControl>
                <FormLabel className="text-xs cursor-pointer">有尾門 (Tail Gate)</FormLabel>
              </FormItem>
            )} />
            <FormField control={form.control} name="maxLoadKg" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">可載重量 (kg)</FormLabel>
                <FormControl><Input type="number" placeholder="3500" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="maxVolumeCbm" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">材積數 (CBM)</FormLabel>
                <FormControl><Input type="number" step="0.1" placeholder="20.5" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
      </div>

      {/* ── 分隔線（桌面版垂直）── */}
      <div className="hidden sm:block w-px bg-border" />
      <div className="block sm:hidden h-px bg-border" />

      {/* ── 右欄：LINE + 匯款 ── */}
      <div className="flex-1 space-y-4">
        {/* LINE 綁定 */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">LINE 綁定</p>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
              <MessageCircle className="w-4 h-4" />
              LINE 綁定說明
              {form.watch("lineUserId") && (
                <span className="ml-auto text-xs font-normal bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> 已綁定
                </span>
              )}
            </div>
            <p className="text-xs text-green-700 leading-relaxed">司機加入公司 LINE 官方帳號後，傳送以下訊息即可自動綁定：</p>
            <code className="block bg-white border border-green-200 rounded-lg px-3 py-2 text-sm font-mono text-green-900 text-center">
              綁定 {form.watch("phone") || "[司機電話號碼]"}
            </code>
            <p className="text-xs text-green-600">綁定成功後系統自動儲存，無需手動輸入 ID。派車時將自動推播 LINE 通知。</p>
            {form.watch("lineUserId") && (
              <p className="text-xs text-slate-500">已綁定 ID：{form.watch("lineUserId")}</p>
            )}
          </div>
        </div>

        {/* 匯款帳號 */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> 匯款帳號資訊
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="bankName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">銀行名稱</FormLabel>
                <FormControl><Input placeholder="台灣銀行" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="bankBranch" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">分行</FormLabel>
                <FormControl><Input placeholder="中山分行" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="bankAccountName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">戶名</FormLabel>
                <FormControl><Input placeholder="帳戶持有人姓名" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="bankAccount" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">帳號</FormLabel>
                <FormControl><Input placeholder="銀行帳號" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerFormFields({ form, isEdit }: { form: ReturnType<typeof useForm<CustomerFormValues>>; isEdit?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row gap-5">
      {/* ── 左欄：基本資料 ── */}
      <div className="flex-1 space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">基本資料</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel className="text-xs">公司名稱 <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input placeholder="某某科技股份有限公司" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="shortName" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">簡稱</FormLabel>
              <FormControl><Input placeholder="常用簡稱" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="taxId" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">統一編號</FormLabel>
              <FormControl>
                <HistoryInput fieldKey="customer-taxId" placeholder="8 位數字" maxLength={8} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">電話 <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input placeholder="09xx-xxx-xxx" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">E-mail</FormLabel>
              <FormControl><Input type="email" placeholder="email@example.com" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="contactPerson" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel className="text-xs">聯絡人</FormLabel>
              <FormControl>
                <HistoryInput fieldKey="customer-contactPerson" placeholder="聯絡人姓名" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="industry" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">產業別</FormLabel>
              <FormControl><Input placeholder="電子、食品..." {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="postalCode" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">郵遞區號</FormLabel>
              <FormControl><Input placeholder="例：100" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="address" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel className="text-xs">通訊地址</FormLabel>
              <FormControl>
                <HistoryInput fieldKey="customer-address" placeholder="台北市中山區XX路XX號" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="invoiceTitle" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel className="text-xs">發票抬頭</FormLabel>
              <FormControl>
                <Input placeholder="開立發票時使用的名稱（可與公司名稱不同）" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="companyAddress" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel className="text-xs">公司地址</FormLabel>
              <FormControl>
                <HistoryInput fieldKey="customer-companyAddress" placeholder="公司登記地址" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="factoryAddress" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel className="text-xs">工廠地址</FormLabel>
              <FormControl>
                <HistoryInput fieldKey="customer-factoryAddress" placeholder="工廠或倉庫實際地址（選填）" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
      </div>

      {/* ── 分隔線（桌面版垂直）── */}
      <div className="hidden sm:block w-px bg-border" />
      <div className="block sm:hidden h-px bg-border" />

      {/* ── 右欄：財務 + 帳號 ── */}
      <div className="sm:w-52 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">財務設定</p>
          <div className="space-y-3">
            <FormField control={form.control} name="paymentType" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">支付方式</FormLabel>
                <FormControl>
                  <select className="w-full h-9 px-3 text-sm border rounded-md bg-background" {...field} value={field.value ?? "cash"}>
                    <option value="cash">現金</option>
                    <option value="monthly">月結</option>
                    <option value="transfer">銀行轉帳</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="monthlyStatementDay" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">結帳日（每月幾號）</FormLabel>
                <FormControl><Input type="number" min="1" max="28" placeholder="5" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
        <div className="border-t pt-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">帳號資訊</p>
          <div className="space-y-3">
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">帳號</FormLabel>
                <FormControl><Input placeholder="登入帳號" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">密碼{isEdit && <span className="text-muted-foreground font-normal ml-1">（留空則不修改）</span>}</FormLabel>
                <FormControl><PasswordInput field={field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orders, isLoading: ordersLoading } = useOrdersData();
  const { data: drivers, isLoading: driversLoading } = useDriversData();
  const { data: customers, isLoading: customersLoading } = useCustomersData();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const { mutateAsync: deleteOrder, isPending: deletingOrder } = useDeleteOrderMutation();
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<{ id: number; label: string } | null>(null);
  const { mutateAsync: createDriver, isPending: creatingDriver } = useCreateDriverMutation();
  const { mutateAsync: updateDriver, isPending: updatingDriver } = useUpdateDriverMutation();
  const { mutateAsync: deleteDriver } = useDeleteDriverMutation();
  const { mutateAsync: createCustomer, isPending: creatingCustomer } = useCreateCustomerMutation();
  const { mutateAsync: updateCustomer, isPending: updatingCustomer } = useUpdateCustomerMutation();
  const { mutateAsync: deleteCustomer } = useDeleteCustomerMutation();

  const [activeTab, setActiveTab] = useState("home");
  const handleTabChange = useCallback((tab: string) => setActiveTab(tab), []);

  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [commissionDriver, setCommissionDriver] = useState<Driver | null>(null);
  const [commissionRate, setCommissionRate] = useState<number>(15);
  const [affiliationFee, setAffiliationFee] = useState<number>(0);
  const [savingCommission, setSavingCommission] = useState(false);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [credDriver, setCredDriver] = useState<Driver | null>(null);
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [savingCred, setSavingCred] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDialogTab, setImportDialogTab] = useState<"customers" | "drivers">("customers");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [quoteOrder, setQuoteOrder] = useState<Order | null>(null);
  const [quoteAmount, setQuoteAmount] = useState<number>(0);

  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [driverSearch, setDriverSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const orderSearchRef = useRef<HTMLInputElement>(null);

  const [enterpriseAccounts, setEnterpriseAccounts] = useState<any[]>([]);
  const [enterprisePwDialog, setEnterprisePwDialog] = useState<{ id: number; companyName: string; accountCode: string } | null>(null);
  const [enterprisePwInput, setEnterprisePwInput] = useState("");
  const [enterprisePwSaving, setEnterprisePwSaving] = useState(false);
  const [enterpriseCreateOpen, setEnterpriseCreateOpen] = useState(false);
  const [enterpriseCreateSaving, setEnterpriseCreateSaving] = useState(false);
  const [enterpriseCreateForm, setEnterpriseCreateForm] = useState({ accountCode: "", companyName: "", contactPerson: "", phone: "", password: "", billingType: "monthly", discountPercent: "0" });
  const [enterpriseEditDialog, setEnterpriseEditDialog] = useState<any | null>(null);
  const [enterpriseEditSaving, setEnterpriseEditSaving] = useState(false);
  const enterpriseEditEmptyForm = () => ({
    companyName: "", shortName: "", contactPerson: "", phone: "", email: "", taxId: "", invoiceTitle: "",
    address: "", postalCode: "", industry: "",
    billingType: "monthly", paymentType: "", creditLimit: "", creditDays: "", monthlyStatementDay: "", discountPercent: "0",
    priceLevel: "", unitPriceFixed: "", minMonthlySpend: "",
    contractType: "", contractStart: "", contractEnd: "",
    priorityDispatch: false, isVip: false, status: "active", exclusiveNote: "", notes: "",
  });
  const [enterpriseEditForm, setEnterpriseEditForm] = useState<Record<string, any>>(enterpriseEditEmptyForm());

  const fetchEnterpriseAccounts = useCallback(async () => {
    try {
      const data = await fetch(apiUrl("/enterprise/accounts")).then(r => r.json());
      setEnterpriseAccounts(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === "customers") fetchEnterpriseAccounts();
  }, [activeTab, fetchEnterpriseAccounts]);

  const saveEnterprisePassword = async () => {
    if (!enterprisePwDialog || !enterprisePwInput.trim()) return;
    setEnterprisePwSaving(true);
    try {
      const res = await fetch(apiUrl(`/enterprise/${enterprisePwDialog.id}/settings`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enterprisePwInput.trim() }),
      });
      if (res.ok) {
        toast({ title: "密碼已更新", description: `${enterprisePwDialog.companyName} 的登入密碼已成功重設` });
        setEnterprisePwDialog(null);
        setEnterprisePwInput("");
      } else {
        toast({ title: "更新失敗", variant: "destructive" });
      }
    } finally {
      setEnterprisePwSaving(false);
    }
  };

  const createEnterpriseAccount = async () => {
    const { accountCode, companyName, contactPerson, phone, password, billingType, discountPercent } = enterpriseCreateForm;
    if (!accountCode.trim() || !companyName.trim() || !password.trim()) return;
    setEnterpriseCreateSaving(true);
    try {
      const res = await fetch(apiUrl("/enterprise"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCode: accountCode.trim().toUpperCase(),
          companyName: companyName.trim(),
          contactPerson: contactPerson.trim(),
          phone: phone.trim(),
          password,
          billingType,
          discountPercent: Number(discountPercent) || 0,
          status: "active",
        }),
      });
      if (res.ok) {
        toast({ title: "企業帳號已建立", description: `${companyName.trim()}（${accountCode.trim().toUpperCase()}）` });
        setEnterpriseCreateOpen(false);
        setEnterpriseCreateForm({ accountCode: "", companyName: "", contactPerson: "", phone: "", password: "", billingType: "monthly", discountPercent: "0" });
        fetchEnterpriseAccounts();
      } else {
        const data = await res.json();
        toast({ title: "建立失敗", description: data.error ?? "未知錯誤", variant: "destructive" });
      }
    } finally {
      setEnterpriseCreateSaving(false);
    }
  };

  const openEnterpriseEdit = (acc: any) => {
    setEnterpriseEditForm({
      companyName: acc.companyName ?? "",
      shortName: acc.shortName ?? "",
      contactPerson: acc.contactPerson ?? "",
      phone: acc.phone ?? "",
      email: acc.email ?? "",
      taxId: acc.taxId ?? "",
      invoiceTitle: acc.invoiceTitle ?? "",
      address: acc.address ?? "",
      postalCode: acc.postalCode ?? "",
      industry: acc.industry ?? "",
      billingType: acc.billingType ?? "monthly",
      paymentType: acc.paymentType ?? "",
      creditLimit: acc.creditLimit ?? "",
      creditDays: acc.creditDays ?? "",
      monthlyStatementDay: acc.monthlyStatementDay ?? "",
      discountPercent: acc.discountPercent ?? "0",
      priceLevel: acc.priceLevel ?? "",
      unitPriceFixed: acc.unitPriceFixed ?? "",
      minMonthlySpend: acc.minMonthlySpend ?? "",
      contractType: acc.contractType ?? "",
      contractStart: acc.contractStart ?? "",
      contractEnd: acc.contractEnd ?? "",
      priorityDispatch: acc.priorityDispatch ?? false,
      isVip: acc.isVip ?? false,
      status: acc.status ?? "active",
      exclusiveNote: acc.exclusiveNote ?? "",
      notes: acc.notes ?? "",
    });
    setEnterpriseEditDialog(acc);
  };

  const saveEnterpriseEdit = async () => {
    if (!enterpriseEditDialog) return;
    setEnterpriseEditSaving(true);
    try {
      const body: Record<string, any> = { ...enterpriseEditForm };
      if (body.creditLimit !== "") body.creditLimit = Number(body.creditLimit); else delete body.creditLimit;
      if (body.creditDays !== "") body.creditDays = Number(body.creditDays); else delete body.creditDays;
      if (body.monthlyStatementDay !== "") body.monthlyStatementDay = Number(body.monthlyStatementDay); else delete body.monthlyStatementDay;
      if (body.discountPercent !== "") body.discountPercent = Number(body.discountPercent); else delete body.discountPercent;
      if (body.unitPriceFixed !== "") body.unitPriceFixed = Number(body.unitPriceFixed); else delete body.unitPriceFixed;
      if (body.minMonthlySpend !== "") body.minMonthlySpend = Number(body.minMonthlySpend); else delete body.minMonthlySpend;
      const res = await fetch(apiUrl(`/enterprise/${enterpriseEditDialog.id}/settings`), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: "企業帳號已更新", description: `${enterpriseEditForm.companyName} 的資料已儲存` });
        setEnterpriseEditDialog(null);
        fetchEnterpriseAccounts();
      } else {
        toast({ title: "儲存失敗", variant: "destructive" });
      }
    } finally {
      setEnterpriseEditSaving(false);
    }
  };

  // ─── Order custom fields ──────────────────────────────────────────────────
  const [orderCustomFields, setOrderCustomFields] = useState<any[]>([]);
  const [editOrderCustomValues, setEditOrderCustomValues] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch(apiUrl("/admin/custom-fields?formType=customer_order"))
      .then(r => r.json())
      .then((rows: any[]) => setOrderCustomFields(rows.filter((f: any) => f.isActive)))
      .catch(() => {});
  }, []);

  // ─── Driver & Vehicle ratings ─────────────────────────────────────────────
  const [driverRatingMap, setDriverRatingMap] = useState<Record<number, { avg: number; count: number }>>({});
  const [perfEvents, setPerfEvents] = useState<any[]>([]);
  const [vehicleLeaderboard, setVehicleLeaderboard] = useState<any[]>([]);
  const [vehicleRatingTab, setVehicleRatingTab] = useState<"driver" | "vehicle">("driver");
  const [selectedVehiclePlate, setSelectedVehiclePlate] = useState<string | null>(null);
  const [vehicleDetail, setVehicleDetail] = useState<any | null>(null);

  const [driverAnalytics, setDriverAnalytics] = useState<any[]>([]);

  const [dispatchAlerts, setDispatchAlerts] = useState<any[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const unreadAlertCount = dispatchAlerts.filter(a => !a.is_acknowledged).length;

  const loadAlerts = useCallback(async () => {
    try {
      const data = await fetch(apiUrl("/dispatch-alerts")).then(r => r.json());
      if (Array.isArray(data)) setDispatchAlerts(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadAlerts();
    const t = setInterval(loadAlerts, 30_000);
    return () => clearInterval(t);
  }, [loadAlerts]);

  const acknowledgeAlert = async (id: number) => {
    await fetch(apiUrl(`/dispatch-alerts/${id}/acknowledge`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: "admin" }) });
    setDispatchAlerts(prev => prev.map(a => a.id === id ? { ...a, is_acknowledged: true, acknowledged_at: new Date().toISOString() } : a));
  };

  const acknowledgeAllAlerts = async () => {
    await fetch(apiUrl("/dispatch-alerts/acknowledge-all"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: "admin" }) });
    setDispatchAlerts(prev => prev.map(a => ({ ...a, is_acknowledged: true })));
  };

  const loadRatings = useCallback(async () => {
    const [lb, pe, vl, da] = await Promise.all([
      fetch(apiUrl("/ratings/leaderboard")).then(r => r.json()).catch(() => []),
      fetch(apiUrl("/ratings/performance-events")).then(r => r.json()).catch(() => []),
      fetch(apiUrl("/ratings/vehicle-leaderboard")).then(r => r.json()).catch(() => []),
      fetch(apiUrl("/drivers/analytics")).then(r => r.json()).catch(() => []),
    ]);
    const map: Record<number, { avg: number; count: number }> = {};
    (lb as any[]).forEach(r => { map[r.id] = { avg: parseFloat(r.avg_stars), count: Number(r.rating_count) }; });
    setDriverRatingMap(map);
    setPerfEvents(pe as any[]);
    setVehicleLeaderboard(vl as any[]);
    setDriverAnalytics(Array.isArray(da) ? da : []);
  }, []);

  useEffect(() => { loadRatings(); }, [loadRatings]);

  const openVehicleDetail = async (plate: string) => {
    setSelectedVehiclePlate(plate);
    const data = await fetch(apiUrl(`/ratings/vehicle/${encodeURIComponent(plate)}`)).then(r => r.json()).catch(() => null);
    setVehicleDetail(data);
  };

  const driverDefaults = { name: "", phone: "", vehicleType: "", licensePlate: "", driverType: "", username: "", password: "", lineUserId: "", bankName: "", bankBranch: "", bankAccount: "", bankAccountName: "", vehicleBrand: "", vehicleYear: "", vehicleTonnage: "", hasTailgate: false, maxLoadKg: "", maxVolumeCbm: "" };
  const createDriverForm = useForm<DriverFormValues>({ resolver: zodResolver(driverFormSchema), defaultValues: driverDefaults });
  const editDriverForm = useForm<DriverFormValues>({ resolver: zodResolver(driverFormSchema), defaultValues: driverDefaults });

  const customerDefaults = { name: "", phone: "", address: "", contactPerson: "", taxId: "", username: "", password: "", invoiceTitle: "", companyAddress: "", factoryAddress: "" };
  const createCustomerForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: customerDefaults });
  const editCustomerForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: customerDefaults });

  const editOrderForm = useForm<OrderEditValues>({ resolver: zodResolver(orderEditSchema), defaultValues: {
    pickupDate: "", pickupTime: "", pickupAddress: "",
    pickupCompany: "", pickupContactPersonName: "", pickupContactPersonPhone: "",
    deliveryDate: "", deliveryTime: "", deliveryAddress: "",
    deliveryCompany: "", deliveryContactPersonName: "", deliveryContactPersonPhone: "",
    requiredVehicleType: "", specialRequirements: "", notes: "",
    extraDeliveryStops: [],
  }});
  const editStopsField = useFieldArray({ control: editOrderForm.control, name: "extraDeliveryStops" });

  const availableDrivers = drivers?.filter((d) => d.status === "available") || [];

  const filteredOrders = useMemo(() => {
    let list = orders ?? [];
    if (orderStatusFilter !== "all") list = list.filter(o => o.status === orderStatusFilter);
    const q = orderSearch.trim().toLowerCase();
    if (q) list = list.filter(o =>
      String(o.id).includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.customerPhone?.toLowerCase().includes(q) ||
      o.pickupAddress?.toLowerCase().includes(q) ||
      o.deliveryAddress?.toLowerCase().includes(q) ||
      o.cargoDescription?.toLowerCase().includes(q)
    );
    return list;
  }, [orders, orderSearch, orderStatusFilter]);

  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (!q) return drivers ?? [];
    return (drivers ?? []).filter(d =>
      d.name?.toLowerCase().includes(q) ||
      d.phone?.toLowerCase().includes(q) ||
      d.vehicleType?.toLowerCase().includes(q) ||
      d.licensePlate?.toLowerCase().includes(q)
    );
  }, [drivers, driverSearch]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers ?? [];
    return (customers ?? []).filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      (c as any).contactPerson?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const pendingCount = useMemo(() => (orders ?? []).filter(o => o.status === "pending").length, [orders]);

  const buildDriverPayload = (data: DriverFormValues) => {
    const base: Record<string, any> = {
      name: data.name,
      phone: data.phone,
      vehicleType: data.vehicleType,
      licensePlate: data.licensePlate,
      lineUserId: data.lineUserId || null,
      driverType: data.driverType || null,
      username: data.username || null,
      bankName: data.bankName || null,
      bankBranch: data.bankBranch || null,
      bankAccount: data.bankAccount || null,
      bankAccountName: data.bankAccountName || null,
      vehicleBrand: data.vehicleBrand || null,
      vehicleYear: data.vehicleYear ? parseInt(data.vehicleYear) : null,
      vehicleTonnage: data.vehicleTonnage || null,
      hasTailgate: data.hasTailgate ?? false,
      maxLoadKg: data.maxLoadKg ? parseFloat(data.maxLoadKg) : null,
      maxVolumeCbm: data.maxVolumeCbm ? parseFloat(data.maxVolumeCbm) : null,
    };
    if (data.password) base.password = data.password;
    return base;
  };

  const onCreateDriverSubmit = async (data: DriverFormValues) => {
    try {
      await createDriver({ data: buildDriverPayload(data) } as any);
      toast({ title: "成功", description: "已新增司機" });
      setDriverDialogOpen(false);
      createDriverForm.reset();
    } catch {
      toast({ title: "失敗", description: "無法新增司機", variant: "destructive" });
    }
  };

  const openEditDriverDialog = (driver: Driver) => {
    setEditingDriver(driver);
    const d = driver as any;
    editDriverForm.reset({
      name: driver.name,
      phone: driver.phone,
      vehicleType: driver.vehicleType,
      licensePlate: driver.licensePlate,
      driverType: driver.driverType ?? "",
      username: driver.username ?? "",
      password: "",
      lineUserId: driver.lineUserId ?? "",
      bankName: d.bankName ?? d.bank_name ?? "",
      bankBranch: d.bankBranch ?? d.bank_branch ?? "",
      bankAccount: d.bankAccount ?? d.bank_account ?? "",
      bankAccountName: d.bankAccountName ?? d.bank_account_name ?? "",
      vehicleBrand: d.vehicleBrand ?? d.vehicle_brand ?? "",
      vehicleYear: d.vehicleYear ?? d.vehicle_year ?? "",
      vehicleTonnage: d.vehicleTonnage ?? d.vehicle_tonnage ?? "",
      hasTailgate: d.hasTailgate ?? d.has_tailgate ?? false,
      maxLoadKg: d.maxLoadKg ?? d.max_load_kg ?? "",
      maxVolumeCbm: d.maxVolumeCbm ?? d.max_volume_cbm ?? "",
    });
  };

  const openCommissionDialog = async (driver: Driver) => {
    setCommissionDriver(driver);
    setCommissionDialogOpen(true);
    try {
      const res = await fetch(apiUrl(`/admin/drivers/${driver.id}/commission`));
      const data = await res.json();
      setCommissionRate(Number(data.commission_rate ?? 15));
      setAffiliationFee(Number(data.monthly_affiliation_fee ?? 0));
    } catch {
      setCommissionRate(15);
      setAffiliationFee(0);
    }
  };

  const saveCommission = async () => {
    if (!commissionDriver) return;
    setSavingCommission(true);
    try {
      await fetch(apiUrl(`/admin/drivers/${commissionDriver.id}/commission`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate, monthlyAffiliationFee: affiliationFee }),
      });
      setCommissionDialogOpen(false);
    } finally {
      setSavingCommission(false);
    }
  };

  const openCredDialog = (driver: Driver) => {
    setCredDriver(driver);
    setCredUsername((driver as any).username ?? "");
    setCredPassword("");
    setCredDialogOpen(true);
  };

  const saveCred = async () => {
    if (!credDriver || !credUsername.trim()) return;
    setSavingCred(true);
    try {
      const body: Record<string, any> = { username: credUsername.trim() };
      if (credPassword) body.password = credPassword;
      const res = await fetch(apiUrl(`/drivers/${credDriver.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: "已更新帳號資訊", description: `帳號：${credUsername.trim().toLowerCase()}` });
        setCredDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["drivers"] });
      } else {
        toast({ title: "更新失敗", variant: "destructive" });
      }
    } finally {
      setSavingCred(false);
    }
  };

  const onEditDriverSubmit = async (data: DriverFormValues) => {
    if (!editingDriver) return;
    try {
      await updateDriver({ id: editingDriver.id, data: buildDriverPayload(data) } as any);
      toast({ title: "成功", description: "司機資料已更新" });
      setEditingDriver(null);
    } catch {
      toast({ title: "失敗", description: "無法更新司機資料", variant: "destructive" });
    }
  };

  const onCreateCustomerSubmit = async (data: CustomerFormValues) => {
    try {
      await createCustomer({
        data: {
          name: data.name,
          shortName: data.shortName || null,
          phone: data.phone,
          email: data.email || null,
          address: data.address || null,
          postalCode: data.postalCode || null,
          contactPerson: data.contactPerson || null,
          taxId: data.taxId || null,
          industry: data.industry || null,
          paymentType: data.paymentType || "cash",
          monthlyStatementDay: data.monthlyStatementDay ? parseInt(data.monthlyStatementDay) : 5,
          username: data.username || null,
          password: data.password || null,
          invoiceTitle: data.invoiceTitle || null,
          companyAddress: data.companyAddress || null,
          factoryAddress: data.factoryAddress || null,
        } as any,
      });
      toast({ title: "成功", description: "已新增客戶" });
      setCustomerDialogOpen(false);
      createCustomerForm.reset();
    } catch {
      toast({ title: "失敗", description: "無法新增客戶", variant: "destructive" });
    }
  };

  const openEditCustomerDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    editCustomerForm.reset({
      name: customer.name,
      shortName: (customer as any).short_name ?? "",
      phone: customer.phone,
      email: (customer as any).email ?? "",
      address: (customer as any).address ?? "",
      postalCode: (customer as any).postal_code ?? "",
      contactPerson: (customer as any).contactPerson ?? "",
      taxId: (customer as any).taxId ?? "",
      industry: (customer as any).industry ?? "",
      paymentType: (customer as any).payment_type ?? "cash",
      monthlyStatementDay: String((customer as any).monthly_statement_day ?? 5),
      username: customer.username ?? "",
      password: customer.password ?? "",
      invoiceTitle: (customer as any).invoice_title ?? "",
      companyAddress: (customer as any).company_address ?? "",
      factoryAddress: (customer as any).factory_address ?? "",
    });
  };

  const onEditCustomerSubmit = async (data: CustomerFormValues) => {
    if (!editingCustomer) return;
    try {
      await updateCustomer({
        id: editingCustomer.id,
        data: {
          name: data.name,
          shortName: data.shortName || null,
          phone: data.phone,
          email: data.email || null,
          address: data.address || null,
          postalCode: data.postalCode || null,
          contactPerson: data.contactPerson || null,
          taxId: data.taxId || null,
          industry: data.industry || null,
          paymentType: data.paymentType || null,
          monthlyStatementDay: data.monthlyStatementDay ? parseInt(data.monthlyStatementDay) : null,
          username: data.username || null,
          password: data.password || null,
          invoiceTitle: data.invoiceTitle || null,
          companyAddress: data.companyAddress || null,
          factoryAddress: data.factoryAddress || null,
        } as any,
      });
      toast({ title: "成功", description: "客戶資料已更新" });
      setEditingCustomer(null);
    } catch {
      toast({ title: "失敗", description: "無法更新客戶資料", variant: "destructive" });
    }
  };

  const handleOrderAssign = async (orderId: number, driverIdStr: string) => {
    const driverId = driverIdStr === "none" ? null : parseInt(driverIdStr, 10);
    try {
      await updateOrder({ id: orderId, data: { driverId, status: driverId ? "assigned" : "pending" } });
      toast({ title: "派車成功", description: `訂單 #${orderId} 已指派` });
    } catch {
      toast({ title: "失敗", description: "無法指派司機", variant: "destructive" });
    }
  };

  const handleOrderStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await updateOrder({ id: orderId, data: { status } });
      toast({ title: "狀態更新", description: `訂單 #${orderId} 已更新` });
    } catch {
      toast({ title: "失敗", description: "無法更新狀態", variant: "destructive" });
    }
  };

  const handleDriverPaymentToggle = async (orderId: number, current: string) => {
    const next = current === "paid" ? "unpaid" : "paid";
    try {
      await updateOrder({ id: orderId, data: { driverPaymentStatus: next as "paid" | "unpaid" } });
      toast({ title: next === "paid" ? "✅ 已標記付款給司機" : "付款狀態已重置" });
    } catch {
      toast({ title: "更新失敗", variant: "destructive" });
    }
  };

  const handleFranchiseePaymentToggle = async (orderId: number, current: string) => {
    const next = current === "paid" ? "unpaid" : "paid";
    try {
      await updateOrder({ id: orderId, data: { franchiseePaymentStatus: next as "paid" | "unpaid" } });
      toast({ title: next === "paid" ? "✅ 已標記付款給加盟主" : "付款狀態已重置" });
    } catch {
      toast({ title: "更新失敗", variant: "destructive" });
    }
  };

  const handleSmartDispatch = async (orderId: number) => {
    const available = drivers?.filter(d => d.status === "available");
    if (!available || available.length === 0) {
      toast({ title: "無可用司機", description: "目前所有司機皆忙碌或離線", variant: "destructive" });
      return;
    }
    const best = available[0];
    try {
      await updateOrder({ id: orderId, data: { driverId: best.id, status: "assigned" } });
      toast({ title: `⚡ 已派車給 ${best.name}`, description: `${best.vehicleType} · ${best.licensePlate}` });
    } catch {
      toast({ title: "派車失敗", variant: "destructive" });
    }
  };

  const openQuoteDialog = (order: Order) => {
    setQuoteOrder(order);
    setQuoteAmount(calculateAutoQuote(order));
  };

  const applyQuote = async () => {
    if (!quoteOrder) return;
    try {
      await updateOrder({ id: quoteOrder.id, data: { totalFee: quoteAmount, feeStatus: "unpaid" } });
      toast({ title: "✅ 運費已套用", description: `NT$${quoteAmount.toLocaleString()}` });
      setQuoteOrder(null);
    } catch {
      toast({ title: "套用失敗", variant: "destructive" });
    }
  };

  const handleDriverStatus = async (driverId: number, status: DriverStatus) => {
    try {
      await updateDriver({ id: driverId, data: { status } });
      toast({ title: "狀態更新" });
    } catch {
      toast({ title: "失敗", variant: "destructive" });
    }
  };

  const handleDeleteDriver = async (driverId: number) => {
    if (!confirm("確定要刪除此司機資料嗎？")) return;
    try {
      await deleteDriver({ id: driverId });
      toast({ title: "刪除成功" });
    } catch {
      toast({ title: "失敗", variant: "destructive" });
    }
  };

  const handleDeleteCustomer = async (customerId: number) => {
    if (!confirm("確定要刪除此客戶資料嗎？")) return;
    try {
      await deleteCustomer({ id: customerId });
      toast({ title: "刪除成功" });
    } catch {
      toast({ title: "失敗", variant: "destructive" });
    }
  };

  const openEditOrderDialog = (order: Order) => {
    setEditingOrder(order);
    // Load existing custom field values
    try {
      const cfv = (order as any).customFieldValues;
      setEditOrderCustomValues(cfv ? JSON.parse(cfv) : {});
    } catch { setEditOrderCustomValues({}); }
    const pickup = parseContactPerson(order.pickupContactPerson);
    const delivery = parseContactPerson(order.deliveryContactPerson);
    const stops = parseExtraStops((order as any).extraDeliveryAddresses);
    editOrderForm.reset({
      pickupDate: order.pickupDate ?? "",
      pickupTime: order.pickupTime ?? "",
      pickupAddress: order.pickupAddress,
      pickupCompany: order.pickupContactName ?? "",
      pickupContactPersonName: pickup.name,
      pickupContactPersonPhone: pickup.phone,
      deliveryDate: order.deliveryDate ?? "",
      deliveryTime: order.deliveryTime ?? "",
      deliveryAddress: order.deliveryAddress,
      deliveryCompany: order.deliveryContactName ?? "",
      deliveryContactPersonName: delivery.name,
      deliveryContactPersonPhone: delivery.phone,
      requiredVehicleType: order.requiredVehicleType ?? "",
      cargoWeight: order.cargoWeight ?? undefined,
      cargoLengthM: order.cargoLengthM ?? undefined,
      cargoWidthM: order.cargoWidthM ?? undefined,
      cargoHeightM: order.cargoHeightM ?? undefined,
      specialRequirements: order.specialRequirements ?? "",
      notes: order.notes ?? "",
      extraDeliveryStops: stops,
    });
  };

  const onEditOrderSubmit = async (data: OrderEditValues) => {
    if (!editingOrder) return;
    const pickupCP = [data.pickupContactPersonName, data.pickupContactPersonPhone].filter(Boolean).join(" ");
    const deliveryCP = [data.deliveryContactPersonName, data.deliveryContactPersonPhone].filter(Boolean).join(" ");
    const extraDeliveryJson = data.extraDeliveryStops?.length
      ? JSON.stringify(data.extraDeliveryStops)
      : null;
    try {
      await updateOrder({
        id: editingOrder.id,
        data: {
          pickupDate: data.pickupDate || null,
          pickupTime: data.pickupTime || null,
          pickupAddress: data.pickupAddress,
          pickupContactName: data.pickupCompany || null,
          pickupContactPerson: pickupCP || null,
          deliveryDate: data.deliveryDate || null,
          deliveryTime: data.deliveryTime || null,
          deliveryAddress: data.deliveryAddress,
          deliveryContactName: data.deliveryCompany || null,
          deliveryContactPerson: deliveryCP || null,
          requiredVehicleType: data.requiredVehicleType || null,
          cargoWeight: data.cargoWeight || null,
          cargoLengthM: data.cargoLengthM || null,
          cargoWidthM: data.cargoWidthM || null,
          cargoHeightM: data.cargoHeightM || null,
          specialRequirements: data.specialRequirements || null,
          notes: data.notes || null,
          extraDeliveryAddresses: extraDeliveryJson,
          customFieldValues: Object.keys(editOrderCustomValues).length > 0 ? editOrderCustomValues : null,
        } as any,
      });
      toast({ title: "✅ 訂單已更新", description: `訂單 #${editingOrder.id} 資料已修改` });
      setEditingOrder(null);
    } catch {
      toast({ title: "更新失敗", description: "請稍後再試", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">富詠運輸</span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
            <Settings2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            後台管理中心
          </h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm hidden sm:block">訂單調派、司機管理、客戶管理、營運報表</p>
        </div>

        {/* 線上人員 + 警示鐘 */}
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <OnlineUsersPanel token={token} />
          <button
            onClick={() => { setAlertsOpen(true); }}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center border shadow-sm transition-all hover:scale-105 active:scale-95 ${unreadAlertCount > 0 ? "bg-red-50 border-red-300 animate-pulse" : "bg-white border-border"}`}
            title={unreadAlertCount > 0 ? `${unreadAlertCount} 則未處理警示` : "派車警示"}
          >
            <Bell className={`w-5 h-5 ${unreadAlertCount > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            {unreadAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none shadow">
                {unreadAlertCount > 99 ? "99+" : unreadAlertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 警示面板 overlay ── */}
      {alertsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={() => setAlertsOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md h-full bg-background shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b bg-red-50">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-red-600" />
                <span className="font-bold text-sm text-red-900">派車警示通知</span>
                {unreadAlertCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{unreadAlertCount} 則未處理</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadAlertCount > 0 && (
                  <button
                    onClick={acknowledgeAllAlerts}
                    className="text-xs text-red-700 border border-red-200 bg-white px-2.5 py-1 rounded-full hover:bg-red-50 font-medium"
                  >
                    全部確認
                  </button>
                )}
                <button
                  onClick={() => { loadAlerts(); fetch(apiUrl("/dispatch-alerts/scan"), { method: "POST" }).then(() => setTimeout(loadAlerts, 500)); }}
                  className="text-xs text-muted-foreground border px-2.5 py-1 rounded-full hover:bg-muted font-medium"
                >
                  重新掃描
                </button>
                <button onClick={() => setAlertsOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-100 text-red-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Alert list */}
            <div className="flex-1 overflow-y-auto divide-y">
              {dispatchAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                  <Bell className="w-8 h-8 opacity-30" />
                  <p className="text-sm">目前無警示</p>
                </div>
              ) : (
                dispatchAlerts.map(alert => {
                  const alertConfig = {
                    unassigned_overdue: { color: "red", icon: "🚨", label: "未派車逾時" },
                    pickup_overdue: { color: "orange", icon: "⏰", label: "未取貨逾時" },
                    delivery_overdue: { color: "yellow", icon: "📦", label: "未送達逾時" },
                  }[alert.alert_type as string] ?? { color: "gray", icon: "⚠️", label: "警示" };

                  return (
                    <div
                      key={alert.id}
                      className={`p-4 transition-colors ${alert.is_acknowledged ? "bg-muted/20 opacity-60" : "bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="text-lg leading-none mt-0.5 shrink-0">{alertConfig.icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                alertConfig.color === "red" ? "bg-red-100 text-red-700"
                                : alertConfig.color === "orange" ? "bg-orange-100 text-orange-700"
                                : alertConfig.color === "yellow" ? "bg-yellow-100 text-yellow-700"
                                : "bg-muted text-muted-foreground"
                              }`}>
                                {alertConfig.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(alert.triggered_at), "MM/dd HH:mm")}
                              </span>
                              {alert.is_acknowledged && (
                                <span className="text-[10px] text-emerald-600 font-medium">✓ 已確認</span>
                              )}
                            </div>
                            <p className="text-xs text-foreground leading-relaxed">{alert.message}</p>
                            {alert.is_acknowledged && alert.acknowledged_at && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                確認時間：{format(new Date(alert.acknowledged_at), "MM/dd HH:mm")}
                              </p>
                            )}
                          </div>
                        </div>
                        {!alert.is_acknowledged && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="shrink-0 text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            確認
                          </button>
                        )}
                      </div>

                      {/* Jump to order button */}
                      <button
                        onClick={() => {
                          setAlertsOpen(false);
                          setActiveTab("orders");
                        }}
                        className="mt-2 ml-8 text-[10px] text-primary hover:underline font-medium"
                      >
                        → 前往訂單管理
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-4 py-2.5 bg-muted/30 text-center">
              <p className="text-[10px] text-muted-foreground">每 30 秒自動更新 · 後端每 2 分鐘掃描逾時訂單</p>
            </div>
          </div>
        </div>
      )}



      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); }} className="w-full">
        {/* ── 主要 5 大類 ── */}
        <TabsList className="flex h-auto gap-1 p-1 mb-1 w-full">
          <TabsTrigger value="home" className="gap-1 text-xs flex-1 flex-col sm:flex-row py-2 sm:py-1.5">
            <span className="text-base leading-none">🏠</span>
            <span className="text-[10px] sm:text-xs leading-tight">首頁</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1 text-xs flex-1 flex-col sm:flex-row py-2 sm:py-1.5 relative">
            <ClipboardList className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">訂單</span>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 sm:static sm:ml-0.5 min-w-[16px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-1 text-xs flex-1 flex-col sm:flex-row py-2 sm:py-1.5">
            <Truck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">司機</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1 text-xs flex-1 flex-col sm:flex-row py-2 sm:py-1.5">
            <Users className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">客戶</span>
          </TabsTrigger>
          <TabsTrigger value="payment" className="gap-1 text-xs flex-1 flex-col sm:flex-row py-2 sm:py-1.5">
            <span className="text-base leading-none sm:hidden">💳</span>
            <span className="hidden sm:inline">💳</span>
            <span className="text-[10px] sm:text-xs leading-tight">財務</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1 text-xs flex-1 flex-col sm:flex-row py-2 sm:py-1.5">
            <Brain className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">AI</span>
          </TabsTrigger>
          {/* 進階 toggle */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            className={`gap-1 text-xs flex-1 flex flex-col sm:flex-row items-center justify-center py-2 sm:py-1.5 rounded-md transition-colors ${advancedOpen ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
          >
            <Layers className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">進階{advancedOpen ? "▲" : "▼"}</span>
          </button>
        </TabsList>

        {/* ── 進階功能列（展開）── 分 4 組橫向捲動，不換行不重疊 ── */}
        {advancedOpen && (
          <div className="mb-1 rounded-xl border border-muted bg-muted/40 overflow-hidden divide-y divide-muted">

            {/* 分析報表 */}
            <div className="flex items-start gap-0">
              <span className="shrink-0 w-14 text-center text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide border-r border-muted py-2.5 bg-muted/60 leading-tight px-1 self-stretch flex items-center justify-center">分析<br/>報表</span>
              <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 bg-transparent flex-1">
                  {[
                    { value: "report",      icon: <BarChart2 className="w-3.5 h-3.5" />,                             label: "報表" },
                    { value: "kpi",         icon: <TrendingUp className="w-3.5 h-3.5" />,                            label: "KPI" },
                    { value: "dailyops",    icon: <BarChart2 className="w-3.5 h-3.5 text-blue-500" />,              label: "運營KPI" },
                    { value: "cost",        icon: <TrendingUp className="w-3.5 h-3.5 text-violet-600" />,           label: "毛利" },
                    { value: "forecast",    icon: <TrendingUp className="w-3.5 h-3.5 text-violet-500" />,           label: "預測" },
                    { value: "performance", icon: <Trophy className="w-3.5 h-3.5 text-yellow-500" />,               label: "績效稽核" },
                    { value: "carbon",      icon: <span className="text-sm leading-none">🌱</span>,                 label: "碳排報表" },
                    { value: "auditlog",    icon: <FileText className="w-3.5 h-3.5 text-slate-500" />,             label: "日誌" },
                    { value: "finance-reports", icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" />,    label: "財務報表" },
                  ].map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg">
                      {t.icon}<span>{t.label}</span>
                    </TabsTrigger>
                  ))}
              </TabsList>
            </div>

            {/* 調度車隊 */}
            <div className="flex items-start gap-0">
              <span className="shrink-0 w-14 text-center text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide border-r border-muted py-2.5 bg-muted/60 leading-tight px-1 self-stretch flex items-center justify-center">調度<br/>車隊</span>
              <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 bg-transparent flex-1">
                  {[
                    { value: "smart",       icon: <Layers className="w-3.5 h-3.5" />,                                label: "智慧調度" },
                    { value: "dispatch",    icon: <Zap className="w-3.5 h-3.5" />,                                  label: "派單優化" },
                    { value: "autorouting", icon: <Navigation className="w-3.5 h-3.5 text-indigo-500" />,           label: "自動分單" },
                    { value: "routeimport", icon: <Upload className="w-3.5 h-3.5 text-blue-500" />,                label: "路線匯入" },
                    { value: "formimport",  icon: <FileText className="w-3.5 h-3.5 text-green-600" />,              label: "表單匯入" },
                    { value: "sheetsync",   icon: <RefreshCw className="w-3.5 h-3.5 text-violet-500" />,            label: "自動同步" },
                    { value: "penalties",   icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />,        label: "Shopee罰款" },
                    { value: "shopeerate",  icon: <Tag className="w-3.5 h-3.5 text-blue-500" />,                    label: "Shopee報價" },
                    { value: "driverearnings", icon: <Calculator className="w-3.5 h-3.5 text-green-600" />,          label: "運費試算" },
                    { value: "pnl",           icon: <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />,          label: "盈虧分析" },
                    { value: "carpool",     icon: <Car className="w-3.5 h-3.5" />,                                  label: "拼車" },
                    { value: "heatmap",     icon: <Map className="w-3.5 h-3.5" />,                                  label: "熱區圖" },
                    { value: "fleetmap",    icon: <Navigation className="w-3.5 h-3.5" />,                           label: "車隊圖" },
                    { value: "vehicles",    icon: <Truck className="w-3.5 h-3.5" />,                                label: "車型庫" },
                    { value: "fleet",       icon: <Bell className="w-3.5 h-3.5" />,                                 label: "車隊" },
                    { value: "outsourcing", icon: <DollarSign className="w-3.5 h-3.5" />,                           label: "轉單" },
                  ].map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg">
                      {t.icon}<span>{t.label}</span>
                    </TabsTrigger>
                  ))}
                  <a href="/fusingao"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium transition-colors whitespace-nowrap">
                    <span className="text-sm leading-none">🏪</span>
                    <span>福興高窗口</span>
                  </a>
              </TabsList>
            </div>

            {/* 帳務財務 */}
            <div className="flex items-start gap-0">
              <span className="shrink-0 w-14 text-center text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide border-r border-muted py-2.5 bg-muted/60 leading-tight px-1 self-stretch flex items-center justify-center">帳務<br/>財務</span>
              <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 bg-transparent flex-1">
                  {[
                    { value: "quotation",   icon: <span className="text-sm leading-none">🧮</span>,                 label: "報價試算" },
                    { value: "quotes",      icon: <span className="text-sm leading-none">📋</span>,                 label: "報價管理" },
                    { value: "routeprice",  icon: <MapPin className="w-3.5 h-3.5" />,                               label: "路線報價" },
                    { value: "vehiclecost", icon: <span className="text-sm leading-none">💰</span>,                 label: "車輛成本" },
                    { value: "invoice",     icon: <DollarSign className="w-3.5 h-3.5 text-emerald-500" />,          label: "電子發票" },
                    { value: "settlement",  icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" />,         label: "結算" },
                    { value: "cashflow",   icon: <Layers className="w-3.5 h-3.5 text-indigo-500" />,              label: "金流拆解" },
                    { value: "billingflow", icon: <RotateCcw className="w-3.5 h-3.5 text-violet-500" />,          label: "金流閉環" },
                    { value: "bidding",    icon: <Layers className="w-3.5 h-3.5 text-orange-500" />,              label: "競標比價" },
                    { value: "approval",    icon: <Shield className="w-3.5 h-3.5 text-amber-500" />,               label: "審批" },
                  ].map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg">
                      {t.icon}<span>{t.label}</span>
                    </TabsTrigger>
                  ))}
              </TabsList>
            </div>

            {/* 系統管理 */}
            <div className="flex items-start gap-0">
              <span className="shrink-0 w-14 text-center text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide border-r border-muted py-2.5 bg-muted/60 leading-tight px-1 self-stretch flex items-center justify-center">系統<br/>管理</span>
              <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 bg-transparent flex-1">
                  {[
                    { value: "crm",         icon: <Building2 className="w-3.5 h-3.5" />,                              label: "廠商管理" },
                    { value: "join",        icon: <UserPlus className="w-3.5 h-3.5" />,                               label: "加盟審核" },
                    { value: "franchisee",  icon: <Building2 className="w-3.5 h-3.5 text-indigo-600" />,             label: "加盟主" },
                    { value: "openapi",     icon: <Globe className="w-3.5 h-3.5 text-blue-500" />,                    label: "API 接口" },
                    { value: "fleetreg",    icon: <Building2 className="w-3.5 h-3.5 text-blue-600" />,               label: "車隊入駐" },
                    { value: "perm",        icon: <span className="text-sm leading-none">🔐</span>,                   label: "權限" },
                    { value: "line",        icon: <MessageCircle className="w-3.5 h-3.5 text-green-500" />,          label: "LINE" },
                    { value: "system",      icon: <Settings2 className="w-3.5 h-3.5" />,                             label: "系統設定" },
                    { value: "zones",       icon: <MapPin className="w-3.5 h-3.5 text-emerald-500" />,               label: "站點" },
                  ].map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg">
                      {t.icon}<span>{t.label}</span>
                    </TabsTrigger>
                  ))}
              </TabsList>
            </div>

          </div>
        )}
        <div className="mb-5" />

        {/* ===== 首頁 TAB ===== */}
        <TabsContent value="home" className="outline-none space-y-0">
          {/* ⚡ 快速開單 — 電話/LINE 接單第一時間就能開 */}
          <QuickOrderPanel
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
              handleTabChange("orders");
            }}
          />
          <AdminHome onTabChange={handleTabChange} />
        </TabsContent>

        {/* ===== 訂單 TAB ===== */}
        <TabsContent value="orders" className="outline-none space-y-3">
          {/* ⚡ 快速開單（電話/LINE 接單） */}
          <QuickOrderPanel onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/orders"] })} />

          {/* Search + Filter bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={orderSearchRef}
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                placeholder="搜尋單號、客戶、地址、貨物..."
                className="w-full h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
              {orderSearch && (
                <button onClick={() => setOrderSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[140px] bg-card text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="pending">待派車</SelectItem>
                <SelectItem value="assigned">已派車</SelectItem>
                <SelectItem value="in_transit">運送中</SelectItem>
                <SelectItem value="delivered">已完成</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
            <p className="sm:self-center text-xs text-muted-foreground whitespace-nowrap shrink-0">
              共 <span className="font-semibold text-foreground">{filteredOrders.length}</span> 筆
              {orderSearch || orderStatusFilter !== "all" ? `（總 ${orders?.length ?? 0}）` : ""}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 whitespace-nowrap shrink-0 h-9 text-violet-700 border-violet-200 hover:bg-violet-50"
              onClick={() => setActiveTab("permissions")}
              title="前往自訂欄位管理"
            >
              <Settings2 className="w-3.5 h-3.5" />
              欄位管理
            </Button>
          </div>

          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[340px]">
                <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">單號</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">客戶</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">貨物 / 金額</th>
                    <th className="px-3 py-2.5 font-semibold">狀態</th>
                    <th className="px-3 py-2.5 font-semibold">指派司機</th>
                    <th className="px-3 py-2.5 font-semibold text-right hidden sm:table-cell">更改狀態</th>
                    <th className="px-3 py-2.5 font-semibold text-center hidden lg:table-cell">付司機</th>
                    <th className="px-3 py-2.5 font-semibold text-center hidden lg:table-cell">付加盟主</th>
                    <th className="px-3 py-2.5 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {ordersLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-4 bg-muted/60 rounded animate-pulse w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{orderSearch || orderStatusFilter !== "all" ? "沒有符合條件的訂單" : "暫無訂單"}</p>
                      </td>
                    </tr>
                  ) : filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/25 transition-colors group">
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-bold text-foreground text-sm">#{order.id}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(order.createdAt), "MM/dd HH:mm")}</div>
                        <div className="sm:hidden text-xs font-medium text-foreground mt-0.5 truncate max-w-[90px]">{order.customerName}</div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="font-medium text-foreground text-sm">{order.customerName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{order.customerPhone}</div>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="text-xs text-foreground/80 truncate max-w-[110px]">{order.cargoDescription}</div>
                        {order.totalFee != null ? (
                          <div className="text-xs font-bold text-emerald-600 mt-0.5">NT${order.totalFee.toLocaleString()}</div>
                        ) : (
                          <button onClick={() => openQuoteDialog(order as Order)}
                            className="mt-0.5 text-[11px] text-orange-500 hover:text-orange-700 flex items-center gap-0.5 font-medium">
                            <Calculator className="w-3 h-3" /> 估價
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-3 py-2.5">
                        {order.status === "pending" && !order.driverId && (
                          <button
                            onClick={() => handleSmartDispatch(order.id)}
                            className="mb-1 flex items-center gap-1 text-[11px] bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold px-2 py-1 rounded-md shadow-sm transition"
                          >
                            <Zap className="w-3 h-3" /> 一鍵派車
                          </button>
                        )}
                        <Select value={order.driverId?.toString() || "none"} onValueChange={(val) => handleOrderAssign(order.id, val)}>
                          <SelectTrigger className="h-7 text-xs w-[120px]">
                            <SelectValue placeholder="選擇司機" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-muted-foreground italic text-xs">未指派</SelectItem>
                            {order.driver && !availableDrivers.find(d => d.id === order.driver?.id) && (
                              <SelectItem value={order.driver.id.toString()} className="text-xs">{order.driver.name} (目前)</SelectItem>
                            )}
                            {availableDrivers.map(d => (
                              <SelectItem key={d.id} value={d.id.toString()} className="text-xs">{d.name} · {d.vehicleType}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-right">
                        <Select value={order.status} onValueChange={(val) => handleOrderStatus(order.id, val as OrderStatus)}>
                          <SelectTrigger className="h-7 text-xs w-[90px] ml-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending" className="text-xs">待派車</SelectItem>
                            <SelectItem value="assigned" className="text-xs">已派車</SelectItem>
                            <SelectItem value="in_transit" className="text-xs">運送中</SelectItem>
                            <SelectItem value="delivered" className="text-xs">已完成</SelectItem>
                            <SelectItem value="cancelled" className="text-xs">已取消</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                        <button
                          onClick={() => handleDriverPaymentToggle(order.id, (order as any).driverPaymentStatus ?? "unpaid")}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                            (order as any).driverPaymentStatus === "paid"
                              ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                              : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                          }`}
                        >
                          {(order as any).driverPaymentStatus === "paid" ? "已付款" : "未付款"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                        <button
                          onClick={() => handleFranchiseePaymentToggle(order.id, (order as any).franchiseePaymentStatus ?? "unpaid")}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                            (order as any).franchiseePaymentStatus === "paid"
                              ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                              : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
                          }`}
                        >
                          {(order as any).franchiseePaymentStatus === "paid" ? "已付款" : "未付款"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedOrder(order as Order)} title="詳情">
                            <Info className="w-3.5 h-3.5" />
                          </Button>
                          {(order.status === "pending" || order.status === "assigned") && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => openEditOrderDialog(order as Order)} title="編輯">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden text-orange-500 hover:bg-orange-50" onClick={() => openQuoteDialog(order as Order)} title="估價">
                            <Calculator className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteOrderTarget({ id: order.id, label: `#${order.id}` })}
                            title="刪除訂單"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 刪除訂單確認 */}
          <AlertDialog open={!!deleteOrderTarget} onOpenChange={v => !v && setDeleteOrderTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="w-5 h-5" /> 確認刪除訂單
                </AlertDialogTitle>
                <AlertDialogDescription>
                  訂單 <span className="font-bold text-foreground">{deleteOrderTarget?.label}</span> 刪除後無法復原，確定要繼續嗎？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deletingOrder}
                  onClick={async () => {
                    if (!deleteOrderTarget) return;
                    try {
                      await deleteOrder(deleteOrderTarget.id);
                      toast({ title: `訂單 ${deleteOrderTarget.label} 已刪除` });
                      setDeleteOrderTarget(null);
                    } catch {
                      toast({ title: "刪除失敗", variant: "destructive" });
                    }
                  }}
                >
                  {deletingOrder ? "刪除中…" : "確認刪除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Auto-quote Dialog */}
          <Dialog open={!!quoteOrder} onOpenChange={(o) => !o && setQuoteOrder(null)}>
            <DialogContent className="sm:max-w-[360px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-orange-500" /> 自動報價
                </DialogTitle>
                <DialogDescription>依貨物資訊自動計算建議運費</DialogDescription>
              </DialogHeader>
              {quoteOrder && (
                <div className="space-y-4 py-2">
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">基本費</span><span>NT$1,500</span>
                    </div>
                    {quoteOrder.requiredVehicleType && quoteOrder.requiredVehicleType !== "不限" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">車型（{quoteOrder.requiredVehicleType}）</span>
                        <span>+NT${({ "小貨車": 0, "中型貨車": 800, "大貨車": 2000, "曳引車": 5000, "冷藏車": 3000 }[quoteOrder.requiredVehicleType] ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(quoteOrder.cargoWeight ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">重量（{quoteOrder.cargoWeight}kg）</span>
                        <span>+NT${quoteOrder.cargoWeight! > 300 ? "4,000" : quoteOrder.cargoWeight! > 100 ? "2,000" : quoteOrder.cargoWeight! > 50 ? "1,000" : quoteOrder.cargoWeight! > 10 ? "500" : "0"}</span>
                      </div>
                    )}
                    {quoteOrder.needTailgate === "yes" && (
                      <div className="flex justify-between"><span className="text-muted-foreground">尾門費</span><span>+NT$500</span></div>
                    )}
                    {quoteOrder.needHydraulicPallet === "yes" && (
                      <div className="flex justify-between"><span className="text-muted-foreground">油壓板車費</span><span>+NT$800</span></div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-black text-orange-600 text-base">
                      <span>建議總費</span><span>NT${quoteAmount.toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold">調整金額（NT$）</label>
                    <Input
                      type="number"
                      value={quoteAmount}
                      onChange={e => setQuoteAmount(Number(e.target.value))}
                      className="mt-1.5 h-12 text-lg font-bold"
                    />
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setQuoteOrder(null)}>取消</Button>
                <Button className="bg-orange-500 hover:bg-orange-600" onClick={applyQuote}>
                  套用報價 NT${quoteAmount.toLocaleString()}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Order Edit Dialog */}
          <Dialog open={!!editingOrder} onOpenChange={(o) => !o && setEditingOrder(null)}>
            <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-orange-500" /> 編輯訂單 #{editingOrder?.id}
                </DialogTitle>
                <DialogDescription>修改預約訂單資訊，儲存後即時同步司機端與客戶端</DialogDescription>
              </DialogHeader>
              <Form {...editOrderForm}>
                <form onSubmit={editOrderForm.handleSubmit(onEditOrderSubmit)} className="space-y-4 py-2">

                  {/* 取貨資訊 */}
                  <div className="border border-orange-200 rounded-xl p-3 space-y-3 bg-orange-50/30">
                    <p className="text-xs font-bold text-orange-600 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> 取貨資訊
                    </p>
                    <FormField control={editOrderForm.control} name="pickupDate" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">取貨日期</FormLabel>
                        <FormControl>
                          <SmartDatePicker value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="pickupTime" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">取貨時間 <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input type="time" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="pickupAddress" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">取貨地址 <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <TaiwanAddressInput
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            historyKey="admin-pickup"
                            error={editOrderForm.formState.errors.pickupAddress?.message}
                          />
                        </FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="pickupCompany" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">公司名稱（選填）</FormLabel>
                        <FormControl><Input placeholder="○○股份有限公司" {...field} /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={editOrderForm.control} name="pickupContactPersonName" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡人姓名</FormLabel>
                          <FormControl><Input placeholder="王先生" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editOrderForm.control} name="pickupContactPersonPhone" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡電話</FormLabel>
                          <FormControl><Input type="tel" placeholder="0912-345-678" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  {/* 主要送貨地點 */}
                  <div className="border border-blue-200 rounded-xl p-3 space-y-3 bg-blue-50/30">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> 主要送達地點
                    </p>
                    <FormField control={editOrderForm.control} name="deliveryDate" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">送達日期</FormLabel>
                        <FormControl>
                          <SmartDatePicker value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="deliveryTime" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">送達時間 <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input type="time" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="deliveryAddress" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">送達地址 <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <TaiwanAddressInput
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            historyKey="admin-delivery"
                            error={editOrderForm.formState.errors.deliveryAddress?.message}
                          />
                        </FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="deliveryCompany" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">公司名稱（選填）</FormLabel>
                        <FormControl><Input placeholder="○○股份有限公司" {...field} /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={editOrderForm.control} name="deliveryContactPersonName" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡人姓名</FormLabel>
                          <FormControl><Input placeholder="李小姐" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editOrderForm.control} name="deliveryContactPersonPhone" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡電話</FormLabel>
                          <FormControl><Input type="tel" placeholder="0988-765-432" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  {/* 多站下貨點 (一取多卸) */}
                  <div className="border border-violet-200 rounded-xl p-3 space-y-3 bg-violet-50/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> 額外下貨站點（一取多卸）
                        {editStopsField.fields.length > 0 && (
                          <span className="font-normal text-violet-500">共 {editStopsField.fields.length} 站</span>
                        )}
                      </p>
                      {editStopsField.fields.length < 5 && (
                        <button type="button"
                          onClick={() => editStopsField.append({ address: "", contactName: "", phone: "", company: "", notes: "", quantity: "", weight: undefined, signStatus: "pending" })}
                          className="text-xs text-violet-700 border border-violet-300 rounded-lg px-2 py-1 hover:bg-violet-100 flex items-center gap-1 font-medium">
                          <Plus className="w-3 h-3" /> 新增站點
                        </button>
                      )}
                    </div>
                    {editStopsField.fields.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">尚未設定額外下貨站點，點右上角「新增站點」即可加入</p>
                    )}
                    {editStopsField.fields.map((sf, idx) => (
                      <div key={sf.id} className="border border-violet-100 rounded-xl p-3 space-y-2.5 bg-white">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-violet-700 flex items-center gap-1.5">
                            <span className="w-5 h-5 bg-violet-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                            站點 {idx + 1}
                          </span>
                          <button type="button" onClick={() => editStopsField.remove(idx)}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.address` as any} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">地址 <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input placeholder="完整地址" {...field} /></FormControl>
                            <FormMessage /></FormItem>
                        )} />
                        <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.company` as any} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">公司（選填）</FormLabel>
                            <FormControl><Input placeholder="公司名稱" {...field} /></FormControl></FormItem>
                        )} />
                        <div className="grid grid-cols-2 gap-2">
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.contactName` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">聯絡人</FormLabel>
                              <FormControl><Input placeholder="姓名" {...field} /></FormControl></FormItem>
                          )} />
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.phone` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">電話</FormLabel>
                              <FormControl><Input type="tel" placeholder="09xx-xxx-xxx" {...field} /></FormControl></FormItem>
                          )} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.quantity` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">件數</FormLabel>
                              <FormControl><Input placeholder="如：3件" {...field} /></FormControl></FormItem>
                          )} />
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.weight` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">重量 (kg)</FormLabel>
                              <FormControl><Input type="number" min={0} step={0.1} placeholder="0.0" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl></FormItem>
                          )} />
                        </div>
                        <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.notes` as any} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">備註（樓層、卸貨需求等）</FormLabel>
                            <FormControl><Textarea className="resize-none text-xs" rows={1} placeholder="例：3樓無電梯" {...field} /></FormControl></FormItem>
                        )} />
                      </div>
                    ))}
                  </div>

                  {/* 車輛 + 貨物 */}
                  <div className="border rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" /> 車輛與貨物
                    </p>
                    <FormField control={editOrderForm.control} name="requiredVehicleType" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">車型需求</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-9"><SelectValue placeholder="選擇車型" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {["廂型1.5T","廂型3.5T","廂型5T","平斗5T","廂型8T","廂型11T","廂型17T","不限"].map(v => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select></FormItem>
                    )} />
                    <div className="grid grid-cols-4 gap-2">
                      <FormField control={editOrderForm.control} name="cargoWeight" render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel className="text-xs">總重量 (kg)</FormLabel>
                          <FormControl><Input type="number" min={0} step={0.1} placeholder="0.0" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl>
                        </FormItem>
                      )} />
                      {(["cargoLengthM","cargoWidthM","cargoHeightM"] as const).map((nm, i) => (
                        <FormField key={nm} control={editOrderForm.control} name={nm} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{["長","寬","高"][i]}(m)</FormLabel>
                            <FormControl><Input type="number" min={0} step={0.01} className="px-2" placeholder="0" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                  </div>

                  {/* 備註 */}
                  <div className="grid grid-cols-1 gap-3">
                    <FormField control={editOrderForm.control} name="specialRequirements" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">特殊需求</FormLabel>
                        <FormControl><Textarea className="resize-none" rows={2} {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="notes" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">備註</FormLabel>
                        <FormControl><Textarea className="resize-none" rows={2} {...field} /></FormControl></FormItem>
                    )} />
                  </div>

                  {/* 自訂欄位 */}
                  {orderCustomFields.length > 0 && (
                    <div className="border border-violet-200 rounded-xl p-3 space-y-3 bg-violet-50/30">
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5" /> 自訂欄位
                      </p>
                      <div className="grid grid-cols-1 gap-3">
                        {orderCustomFields.map((cf: any) => (
                          <div key={cf.fieldKey} className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {cf.fieldLabel}{cf.isRequired && <span className="text-destructive ml-0.5">*</span>}
                            </label>
                            {cf.fieldType === "textarea" ? (
                              <Textarea
                                rows={2}
                                className="resize-none text-sm"
                                value={editOrderCustomValues[cf.fieldKey] ?? ""}
                                onChange={e => setEditOrderCustomValues(prev => ({ ...prev, [cf.fieldKey]: e.target.value }))}
                              />
                            ) : cf.fieldType === "select" ? (
                              <select
                                className="w-full h-9 px-3 text-sm border rounded-md bg-background"
                                value={editOrderCustomValues[cf.fieldKey] ?? ""}
                                onChange={e => setEditOrderCustomValues(prev => ({ ...prev, [cf.fieldKey]: e.target.value }))}
                              >
                                <option value="">-- 請選擇 --</option>
                                {(cf.options ?? []).map((opt: string) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : cf.fieldType === "checkbox" ? (
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-primary"
                                  checked={editOrderCustomValues[cf.fieldKey] === "true"}
                                  onChange={e => setEditOrderCustomValues(prev => ({ ...prev, [cf.fieldKey]: String(e.target.checked) }))}
                                />
                                <span className="text-sm">{cf.fieldLabel}</span>
                              </label>
                            ) : (
                              <input
                                type={cf.fieldType === "number" ? "number" : cf.fieldType === "date" ? "date" : "text"}
                                className="w-full h-9 px-3 text-sm border rounded-md bg-background"
                                value={editOrderCustomValues[cf.fieldKey] ?? ""}
                                onChange={e => setEditOrderCustomValues(prev => ({ ...prev, [cf.fieldKey]: e.target.value }))}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <DialogFooter className="gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setEditingOrder(null)}>取消</Button>
                    <Button type="submit" className="gap-2 bg-orange-500 hover:bg-orange-600">
                      <Save className="w-4 h-4" /> 儲存所有變更
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Order Detail Dialog */}
          <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
            <DialogContent className="sm:max-w-[540px] max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" /> 訂單詳情 #{selectedOrder?.id}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  {selectedOrder && <OrderStatusBadge status={selectedOrder.status} />}
                  {selectedOrder && ` · 建立於 ${format(new Date(selectedOrder.createdAt), "yyyy/MM/dd HH:mm")}`}
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (() => {
                const extraStops = parseExtraStops((selectedOrder as any).extraDeliveryAddresses);
                const totalStops = 1 + extraStops.length;
                const signedCount = extraStops.filter((s: any) => s.signStatus === "signed").length;
                return (
                  <div className="space-y-4 text-sm py-2">

                    {/* 委託方 */}
                    <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">委託方</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">姓名</span><span className="font-semibold">{selectedOrder.customerName}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">電話</span><a href={`tel:${selectedOrder.customerPhone}`} className="font-mono text-blue-600 font-bold">{selectedOrder.customerPhone}</a></div>
                    </div>

                    {/* 取貨 */}
                    <div className="border border-orange-200 rounded-xl p-3 space-y-1.5 bg-orange-50/40">
                      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> 取貨地點
                      </p>
                      {(selectedOrder.pickupDate || selectedOrder.pickupTime) && (
                        <div className="flex justify-between"><span className="text-muted-foreground">日期/時段</span><span className="font-medium">{selectedOrder.pickupDate} {selectedOrder.pickupTime}</span></div>
                      )}
                      {selectedOrder.pickupContactName && <div className="flex justify-between"><span className="text-muted-foreground">公司</span><span className="font-medium">{selectedOrder.pickupContactName}</span></div>}
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">地址</span><span className="font-semibold text-right">{selectedOrder.pickupAddress}</span></div>
                      {selectedOrder.pickupContactPerson && <div className="flex justify-between"><span className="text-muted-foreground">聯絡人/電話</span><span>{selectedOrder.pickupContactPerson}</span></div>}
                    </div>

                    {/* 路線圖：主送達 + 多站 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" /> 送達路線
                        </p>
                        {totalStops > 1 && (
                          <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 font-medium">
                            共 {totalStops} 站 · 已簽收 {signedCount + (selectedOrder.status === "delivered" ? 1 : 0)}/{totalStops}
                          </span>
                        )}
                      </div>

                      {/* Main stop */}
                      <div className="border border-blue-200 rounded-xl p-3 space-y-1.5 bg-blue-50/40">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">主</span>
                          <span className="text-xs font-bold text-blue-700">主要送達地點</span>
                          {selectedOrder.status === "delivered" && <span className="ml-auto text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已完成</span>}
                        </div>
                        {(selectedOrder.deliveryDate || selectedOrder.deliveryTime) && (
                          <div className="flex justify-between"><span className="text-muted-foreground">日期/時段</span><span className="font-medium">{selectedOrder.deliveryDate} {selectedOrder.deliveryTime}</span></div>
                        )}
                        {selectedOrder.deliveryContactName && <div className="flex justify-between"><span className="text-muted-foreground">公司</span><span className="font-medium">{selectedOrder.deliveryContactName}</span></div>}
                        <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">地址</span><span className="font-semibold text-right">{selectedOrder.deliveryAddress}</span></div>
                        {selectedOrder.deliveryContactPerson && <div className="flex justify-between"><span className="text-muted-foreground">聯絡人/電話</span><span>{selectedOrder.deliveryContactPerson}</span></div>}
                      </div>

                      {/* Extra stops */}
                      {extraStops.map((stop: any, idx: number) => {
                        const signed = stop.signStatus === "signed";
                        return (
                          <div key={idx} className={`mt-2 border rounded-xl p-3 space-y-1.5 ${signed ? "bg-emerald-50/50 border-emerald-200" : "border-violet-200 bg-violet-50/30"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 text-white ${signed ? "bg-emerald-500" : "bg-violet-600"}`}>{idx + 1}</span>
                              <span className="text-xs font-bold text-violet-700">站點 {idx + 1}</span>
                              {signed && <span className="ml-auto text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已簽收</span>}
                            </div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">地址</span><span className={`font-semibold text-right ${signed ? "line-through opacity-60" : ""}`}>{stop.address}</span></div>
                            {stop.company && <div className="flex justify-between"><span className="text-muted-foreground">公司</span><span>{stop.company}</span></div>}
                            {stop.contactName && <div className="flex justify-between"><span className="text-muted-foreground">聯絡人</span><span>{stop.contactName}{stop.phone ? ` · ${stop.phone}` : ""}</span></div>}
                            {(stop.quantity || stop.weight) && (
                              <div className="flex gap-2 mt-1">
                                {stop.quantity && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium border border-blue-100">{stop.quantity}</span>}
                                {stop.weight && <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-medium border border-orange-100">{stop.weight} kg</span>}
                              </div>
                            )}
                            {stop.notes && <p className="text-xs text-muted-foreground">📝 {stop.notes}</p>}
                          </div>
                        );
                      })}
                    </div>

                    {/* 貨物 + 車輛 */}
                    <div className="border rounded-xl p-3 space-y-1.5">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">貨物 / 車輛</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">貨物描述</span><span className="font-medium">{selectedOrder.cargoDescription}</span></div>
                      {selectedOrder.cargoQuantity && <div className="flex justify-between"><span className="text-muted-foreground">總件數</span><span>{selectedOrder.cargoQuantity}</span></div>}
                      {selectedOrder.cargoWeight != null && <div className="flex justify-between"><span className="text-muted-foreground">總重量</span><span>{selectedOrder.cargoWeight} kg</span></div>}
                      {(selectedOrder.cargoLengthM || selectedOrder.cargoWidthM || selectedOrder.cargoHeightM) && (
                        <div className="flex justify-between"><span className="text-muted-foreground">材積</span>
                          <span>{selectedOrder.cargoLengthM?.toFixed(2)}×{selectedOrder.cargoWidthM?.toFixed(2)}×{selectedOrder.cargoHeightM?.toFixed(2)} m
                            {selectedOrder.cargoLengthM && selectedOrder.cargoWidthM && selectedOrder.cargoHeightM
                              ? ` (${(selectedOrder.cargoLengthM * selectedOrder.cargoWidthM * selectedOrder.cargoHeightM).toFixed(2)} m³)` : ""}</span>
                        </div>
                      )}
                      {selectedOrder.requiredVehicleType && <div className="flex justify-between"><span className="text-muted-foreground">車型需求</span><span className="font-medium">{selectedOrder.requiredVehicleType}</span></div>}
                      {selectedOrder.needTailgate === "yes" && <div className="flex justify-between"><span className="text-muted-foreground">需尾門</span><span className="text-amber-600">✔ 需要</span></div>}
                      {selectedOrder.needHydraulicPallet === "yes" && <div className="flex justify-between"><span className="text-muted-foreground">需油壓板車</span><span className="text-amber-600">✔ 需要</span></div>}
                    </div>

                    {(selectedOrder.specialRequirements || selectedOrder.notes) && (
                      <div className="border rounded-xl p-3 space-y-2">
                        {selectedOrder.specialRequirements && (
                          <div><p className="text-xs font-bold text-muted-foreground mb-1">特殊需求</p>
                            <p className="text-xs bg-blue-50 border border-blue-100 rounded p-2 text-blue-900">{selectedOrder.specialRequirements}</p></div>
                        )}
                        {selectedOrder.notes && (
                          <div><p className="text-xs font-bold text-muted-foreground mb-1">備註</p>
                            <p className="text-xs bg-amber-50 border border-amber-100 rounded p-2 text-amber-900">{selectedOrder.notes}</p></div>
                        )}
                      </div>
                    )}

                    {/* 自訂欄位值顯示 */}
                    {(() => {
                      try {
                        const cfv = (selectedOrder as any).customFieldValues;
                        const vals: Record<string, string> = cfv ? JSON.parse(cfv) : {};
                        const filledFields = orderCustomFields.filter(cf => vals[cf.fieldKey]);
                        if (!filledFields.length) return null;
                        return (
                          <div className="border border-violet-200 rounded-xl p-3 space-y-1.5 bg-violet-50/30">
                            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <Settings2 className="w-3.5 h-3.5" /> 自訂欄位
                            </p>
                            {filledFields.map((cf: any) => (
                              <div key={cf.fieldKey} className="flex justify-between gap-4">
                                <span className="text-muted-foreground shrink-0 text-xs">{cf.fieldLabel}</span>
                                <span className="font-medium text-sm text-right">
                                  {cf.fieldType === "checkbox" ? (vals[cf.fieldKey] === "true" ? "✔ 是" : "✘ 否") : vals[cf.fieldKey]}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch { return null; }
                    })()}

                    {/* Pricing Panel */}
                    <PricingPanel
                      order={selectedOrder as any}
                      mode="admin"
                      onRefresh={() => setSelectedOrder(null)}
                    />
                  </div>
                );
              })()}
              <DialogFooter className="gap-2">
                {selectedOrder && (selectedOrder.status === "pending" || selectedOrder.status === "assigned") && (
                  <Button variant="outline" className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => { openEditOrderDialog(selectedOrder!); setSelectedOrder(null); }}>
                    <Pencil className="w-3.5 h-3.5" /> 編輯
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedOrder(null)}>關閉</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ===== 司機 TAB ===== */}
        <TabsContent value="drivers" className="outline-none space-y-3">
          {/* ── 待審核司機申請 ── */}
          {(() => {
            const pending = (drivers ?? []).filter(d => d.status === "offline" && d.username);
            if (!pending.length) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Bell className="w-4 h-4" />
                  待審核司機申請（{pending.length} 筆）
                </div>
                <div className="space-y-1.5">
                  {pending.map(d => (
                    <div key={d.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 shadow-sm border border-amber-100">
                      <div>
                        <span className="font-semibold text-sm text-gray-800">{d.name}</span>
                        <span className="ml-2 text-xs text-gray-500">{d.phone}</span>
                        <span className="ml-2 text-xs text-gray-400">{d.vehicleType}｜{d.licensePlate}</span>
                      </div>
                      <Button size="sm" className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                        onClick={() => handleDriverStatus(d.id, "available")}>
                        <CheckCircle className="w-3.5 h-3.5" /> 啟動
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={driverSearch}
                onChange={e => setDriverSearch(e.target.value)}
                placeholder="搜尋姓名、電話、車型、車牌..."
                className="w-full h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
              {driverSearch && (
                <button onClick={() => setDriverSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => { setImportDialogTab("drivers"); setImportDialogOpen(true); }}>
                <Upload className="w-3.5 h-3.5" /> 批量匯入
              </Button>
            <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 h-9">
                  <UserPlus className="w-3.5 h-3.5" /> 新增司機
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新增司機資料</DialogTitle>
                  <DialogDescription>填寫司機基本資料、帳號密碼與車輛資訊</DialogDescription>
                </DialogHeader>
                <Form {...createDriverForm}>
                  <form onSubmit={createDriverForm.handleSubmit(onCreateDriverSubmit)} className="space-y-4 py-2">
                    <DriverFormFields form={createDriverForm} />
                    <DialogFooter className="pt-2">
                      <Button type="submit" disabled={creatingDriver} className="w-full">
                        {creatingDriver ? "儲存中..." : "建立司機檔案"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          <Dialog open={!!editingDriver} onOpenChange={(open) => { if (!open) setEditingDriver(null); }}>
            <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>編輯司機資料</DialogTitle>
                <DialogDescription>修改司機基本資料、帳號密碼與車輛資訊</DialogDescription>
              </DialogHeader>
              <Form {...editDriverForm}>
                <form onSubmit={editDriverForm.handleSubmit(onEditDriverSubmit)} className="space-y-4 py-2">
                  <DriverFormFields form={editDriverForm} isEdit />
                  <DialogFooter className="pt-2">
                    <Button type="submit" disabled={updatingDriver} className="w-full">
                      {updatingDriver ? "儲存中..." : "儲存變更"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* ── 靠行費／抽成設定 Dialog（後台隱藏，司機不可見）── */}
          <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-violet-600" />
                  靠行費 ／ 抽成設定
                </DialogTitle>
                <DialogDescription>
                  {commissionDriver?.name}（{commissionDriver?.licensePlate}）
                  ─ 此設定僅後台可見，司機只看到扣後金額
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-2">
                {/* Commission rate */}
                <div className="space-y-2">
                  <label className="text-sm font-bold flex items-center gap-1.5">
                    <span className="w-6 h-6 bg-violet-100 text-violet-700 rounded-full flex items-center justify-center text-xs font-black">%</span>
                    運費抽成比例（%）
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min={0} max={100} step={0.5}
                      value={commissionRate}
                      onChange={e => setCommissionRate(Number(e.target.value))}
                      className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <span className="text-sm text-muted-foreground w-20">
                      預估每萬抽 NT${Math.round(10000 * commissionRate / 100).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    系統預設 15%。修改後新完成訂單即時套用。
                  </p>
                </div>

                {/* Monthly affiliation fee */}
                <div className="space-y-2">
                  <label className="text-sm font-bold flex items-center gap-1.5">
                    <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-black">月</span>
                    月靠行費（NT$）
                  </label>
                  <input
                    type="number" min={0} step={100}
                    value={affiliationFee}
                    onChange={e => setAffiliationFee(Number(e.target.value))}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <p className="text-xs text-muted-foreground">
                    每月固定從司機「本月收入」中扣除，0 代表不收。
                  </p>
                </div>

                {/* Preview */}
                <div className="bg-muted/50 rounded-xl p-3 text-sm space-y-1">
                  <p className="text-muted-foreground text-xs font-bold mb-1.5">試算範例（假設本月運費 NT$50,000）</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">運費總計</span>
                    <span className="font-mono">NT$50,000</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span>抽成（{commissionRate}%）</span>
                    <span className="font-mono">−NT${Math.round(50000 * commissionRate / 100).toLocaleString()}</span>
                  </div>
                  {affiliationFee > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>月靠行費</span>
                      <span className="font-mono">−NT${Number(affiliationFee).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-emerald-700 border-t pt-1 mt-1">
                    <span>司機實領</span>
                    <span className="font-mono">
                      NT${Math.max(0, 50000 - Math.round(50000 * commissionRate / 100) - affiliationFee).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCommissionDialogOpen(false)}>取消</Button>
                <Button onClick={saveCommission} disabled={savingCommission}
                  className="bg-violet-600 hover:bg-violet-700 text-white">
                  {savingCommission ? "儲存中..." : "儲存費率"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── 快速帳號密碼設定 Dialog ─── */}
          <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
            <DialogContent className="sm:max-w-[360px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  司機帳號密碼設定
                </DialogTitle>
                <DialogDescription>
                  {credDriver?.name}（{(credDriver as any)?.licensePlate}）
                  {(credDriver as any)?.username && <span className="text-emerald-600">　現有帳號：{(credDriver as any).username}</span>}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold">登入帳號</label>
                  <Input
                    value={credUsername}
                    onChange={e => setCredUsername(e.target.value)}
                    placeholder="請輸入帳號（自動轉小寫）"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">帳號儲存時自動轉為小寫，司機以此帳號登入</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold">
                    登入密碼
                    {(credDriver as any)?.username && <span className="text-muted-foreground font-normal ml-1 text-xs">（留空則不修改）</span>}
                  </label>
                  <Input
                    type="password"
                    value={credPassword}
                    onChange={e => setCredPassword(e.target.value)}
                    placeholder={(credDriver as any)?.username ? "不修改請留空" : "請輸入新密碼"}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">密碼以加密方式儲存，系統無法查看原始密碼</p>
                </div>
                {!(credDriver as any)?.username && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-medium">⚠ 此司機尚未設定帳號，設定後才可登入司機平台</p>
                    <p className="text-xs text-amber-600 mt-1">建議格式：driver{credDriver?.id}，密碼：fuying2025</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCredDialogOpen(false)}>取消</Button>
                <Button
                  onClick={saveCred}
                  disabled={savingCred || !credUsername.trim() || (!(credDriver as any)?.username && !credPassword)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {savingCred ? "儲存中..." : "儲存帳號"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[300px]">
                <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">姓名 / 電話</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">類型</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">車型 / 車牌</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">帳號</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">LINE</th>
                    <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">客戶評分</th>
                    <th className="px-3 py-2.5 font-semibold">狀態</th>
                    <th className="px-3 py-2.5 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {driversLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted/60 rounded animate-pulse w-20" /></td>)}</tr>
                    ))
                  ) : filteredDrivers.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-sm">
                      {driverSearch ? "沒有符合搜尋的司機" : "尚無司機資料，請新增"}
                    </td></tr>
                  ) : filteredDrivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-muted/25 transition-colors group">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-foreground text-sm">{driver.name}</div>
                        <div className="text-muted-foreground font-mono text-xs">{driver.phone}</div>
                        <div className="sm:hidden text-xs text-muted-foreground mt-0.5">{driver.vehicleType} · <span className="font-mono uppercase">{driver.licensePlate}</span></div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {driver.driverType ? (
                          <Badge variant="outline" className="text-[11px] whitespace-nowrap">
                            {DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="text-xs text-foreground">{driver.vehicleType}</div>
                        <span className="font-mono text-[11px] bg-muted border px-1.5 py-0.5 rounded uppercase">{driver.licensePlate}</span>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {(driver as any).username ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-mono text-foreground font-semibold">{(driver as any).username}</span>
                            <span className="text-[10px] text-emerald-600 font-medium">有密碼 ✓</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                            ⚠ 未設帳號
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {driver.lineUserId ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <MessageCircle className="w-3 h-3" /> 已綁定
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageCircleOff className="w-3 h-3" /> 未綁定
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        {(() => {
                          const r = driverRatingMap[driver.id];
                          const evt = perfEvents.find(e => e.driver_id === driver.id && !e.is_resolved);
                          return r ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-bold">{r.avg.toFixed(1)}</span>
                                <span className="text-xs text-muted-foreground">({r.count}筆)</span>
                              </div>
                              {evt && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  evt.event_level === "reward"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-red-100 text-red-700"
                                }`}>
                                  {evt.title.replace(/[🏆⭐🥇✨⚠️🚫🔻]/gu, "").trim()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">尚無評分</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <Select value={driver.status} onValueChange={(val) => handleDriverStatus(driver.id, val as DriverStatus)}>
                          <SelectTrigger className="h-7 w-[95px] border-0 shadow-none p-1 hover:bg-muted/60">
                            <DriverStatusBadge status={driver.status} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available" className="text-xs">可接單</SelectItem>
                            <SelectItem value="busy" className="text-xs">忙碌中</SelectItem>
                            <SelectItem value="offline" className="text-xs">下線</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" onClick={() => openCredDialog(driver)}
                            title="帳號密碼設定"
                            className={`h-9 w-9 ${(driver as any).username ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" : "text-amber-500 hover:text-amber-700 hover:bg-amber-50"}`}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openCommissionDialog(driver)}
                            title="靠行費／抽成設定"
                            className="h-9 w-9 text-violet-500 hover:text-violet-700 hover:bg-violet-100">
                            <Percent className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDriverDialog(driver)}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDriver(driver.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ─── 司機本月收入排行 ─── */}
          {driverAnalytics.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  本月司機收入排行
                  <button onClick={loadRatings} className="ml-auto text-xs text-primary border border-primary/30 px-2 py-0.5 rounded-full hover:bg-primary/10">重整</button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">司機</th>
                        <th className="px-3 py-2 text-left font-semibold hidden sm:table-cell">服務區域</th>
                        <th className="px-3 py-2 text-right font-semibold">本月收入</th>
                        <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">完成單數</th>
                        <th className="px-3 py-2 text-right font-semibold">接單率</th>
                        <th className="px-3 py-2 text-right font-semibold hidden md:table-cell">評分</th>
                        <th className="px-3 py-2 text-center font-semibold">GPS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {driverAnalytics.map((d: any, idx: number) => {
                        const serviceAreas: string[] = d.service_areas ? (typeof d.service_areas === "string" ? JSON.parse(d.service_areas) : d.service_areas) : [];
                        const hasRecentGps = d.last_location_at && (Date.now() - new Date(d.last_location_at).getTime() < 24 * 60 * 60 * 1000);
                        const earnings = Number(d.month_earnings ?? 0);
                        const acceptRate = d.accept_rate != null ? Number(d.accept_rate) : null;
                        const avgStars = d.avg_stars ? parseFloat(d.avg_stars) : null;
                        return (
                          <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${idx === 0 ? "bg-yellow-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-600" : "bg-slate-200 text-slate-600"}`}>
                                  {idx + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-sm">{d.name}</p>
                                  <p className="text-xs text-muted-foreground">{d.vehicle_type}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 hidden sm:table-cell">
                              <div className="flex flex-wrap gap-1 max-w-[140px]">
                                {serviceAreas.length > 0
                                  ? serviceAreas.slice(0, 2).map(a => <span key={a} className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">{a}</span>)
                                  : <span className="text-xs text-muted-foreground">—</span>}
                                {serviceAreas.length > 2 && <span className="text-[10px] text-muted-foreground">+{serviceAreas.length - 2}</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`font-bold ${earnings > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                {earnings > 0 ? `$${earnings.toLocaleString()}` : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground text-xs hidden sm:table-cell">
                              {d.completed_count ?? 0} 單
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {acceptRate !== null
                                ? <span className={`text-xs font-bold ${acceptRate >= 80 ? "text-emerald-600" : acceptRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>{acceptRate}%</span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right hidden md:table-cell">
                              {avgStars ? <span className={`text-xs font-bold ${avgStars >= 4.5 ? "text-emerald-600" : avgStars >= 3.5 ? "text-blue-600" : "text-red-600"}`}>★ {avgStars.toFixed(1)}</span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {hasRecentGps ? (
                                <span title={`上次定位：${format(new Date(d.last_location_at), "MM/dd HH:mm")}`}>
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shadow shadow-emerald-200 animate-pulse" />
                                </span>
                              ) : (
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200" title="無GPS" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── GPS 即時狀態面板 ─── */}
          {driverAnalytics.some(d => d.last_location_at) && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  司機 GPS 狀態
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {driverAnalytics.filter(d => d.last_location_at && Date.now() - new Date(d.last_location_at).getTime() < 24 * 60 * 60 * 1000).length} 位今日回報
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {driverAnalytics.filter(d => d.last_location_at).map((d: any) => {
                    const minsAgo = Math.round((Date.now() - new Date(d.last_location_at).getTime()) / 60000);
                    const isRecent = minsAgo < 60;
                    const isToday2 = minsAgo < 24 * 60;
                    const mapsUrl = `https://www.google.com/maps?q=${d.latitude},${d.longitude}`;
                    return (
                      <a key={d.id} href={mapsUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-xl border p-2.5 hover:bg-muted/40 transition-colors group">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isRecent ? "bg-emerald-400" : isToday2 ? "bg-yellow-400" : "bg-slate-300"}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {minsAgo < 60 ? `${minsAgo}分鐘前` : minsAgo < 1440 ? `${Math.round(minsAgo / 60)}小時前` : `${Math.round(minsAgo / 1440)}天前`}
                          </p>
                        </div>
                        <MapPin className="w-3 h-3 text-muted-foreground ml-auto group-hover:text-blue-500 shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── 服務區域概覽 ─── */}
          {driverAnalytics.some(d => d.service_areas) && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-violet-500" />
                  服務區域覆蓋
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const areaMap: Record<string, string[]> = {};
                    driverAnalytics.forEach(d => {
                      const areas: string[] = d.service_areas ? (typeof d.service_areas === "string" ? JSON.parse(d.service_areas) : d.service_areas) : [];
                      areas.forEach(a => { areaMap[a] = areaMap[a] ?? []; areaMap[a].push(d.name); });
                    });
                    return Object.entries(areaMap).sort((a, b) => b[1].length - a[1].length).map(([area, names]) => (
                      <div key={area} className="flex items-center gap-1.5 bg-violet-50 border border-violet-100 rounded-full px-3 py-1.5">
                        <span className="text-xs font-bold text-violet-800">{area}</span>
                        <span className="text-[10px] text-violet-600 bg-violet-200 rounded-full px-1.5 py-0.5">{names.length} 位</span>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── 車輛評分排行榜 ─── */}
          {vehicleLeaderboard.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-500" />
                  車輛客戶評分排行
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{vehicleLeaderboard.length} 台車</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[380px]">
                    <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">車牌</th>
                        <th className="px-3 py-2 text-left font-semibold hidden sm:table-cell">車型</th>
                        <th className="px-3 py-2 text-right font-semibold">平均分</th>
                        <th className="px-3 py-2 text-right font-semibold">評分數</th>
                        <th className="px-3 py-2 text-right font-semibold">差評</th>
                        <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">使用司機</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {vehicleLeaderboard.map((v: any) => {
                        const avg = parseFloat(v.avg_stars);
                        const badPct = Number(v.rating_count) > 0 ? Math.round(Number(v.bad_count) / Number(v.rating_count) * 100) : 0;
                        return (
                          <tr key={v.license_plate} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="font-mono font-bold text-sm bg-slate-100 px-2 py-0.5 rounded">{v.license_plate}</span>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
                              {v.vehicle_brand ? `${v.vehicle_brand} · ` : ""}{v.vehicle_type}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`font-bold ${avg >= 4.5 ? "text-emerald-600" : avg >= 3.5 ? "text-blue-600" : "text-red-600"}`}>
                                ★ {avg.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{v.rating_count}</td>
                            <td className="px-3 py-2.5 text-right">
                              {Number(v.bad_count) > 0
                                ? <span className="text-red-600 font-medium">{v.bad_count} ({badPct}%)</span>
                                : <span className="text-emerald-600 text-xs">0</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                              {(v.driver_names ?? []).join("、")}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                className="text-xs text-primary border border-primary/30 px-2 py-0.5 rounded-full hover:bg-primary/10 transition-colors"
                                onClick={() => openVehicleDetail(v.license_plate)}
                              >
                                詳情
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 車輛評分詳情 Dialog */}
          <Dialog open={!!selectedVehiclePlate} onOpenChange={o => { if (!o) { setSelectedVehiclePlate(null); setVehicleDetail(null); }}}>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-500" />
                  車輛評分詳情：{selectedVehiclePlate}
                </DialogTitle>
                <DialogDescription>此車牌的全部客戶評分記錄與分析</DialogDescription>
              </DialogHeader>
              {!vehicleDetail && <div className="py-8 text-center text-muted-foreground text-sm">載入中…</div>}
              {vehicleDetail && (() => {
                const s = vehicleDetail.stats;
                const avg = s ? parseFloat(s.avg_stars) : null;
                return (
                  <div className="space-y-4 py-1 text-sm">
                    {/* Overall stats */}
                    {s && (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: "平均分", value: avg ? `★ ${avg.toFixed(2)}` : "—", color: avg && avg >= 4.5 ? "text-emerald-600" : avg && avg >= 3.5 ? "text-blue-600" : "text-red-600" },
                          { label: "評分總數", value: s.total, color: "" },
                          { label: "差評(1-2★)", value: s.bad_count, color: Number(s.bad_count) > 0 ? "text-red-600" : "text-emerald-600" },
                          { label: "近30天差評", value: s.bad_month, color: Number(s.bad_month) > 0 ? "text-orange-600" : "text-emerald-600" },
                        ].map(item => (
                          <div key={item.label} className="rounded-xl border p-2.5 text-center">
                            <p className={`font-bold text-base ${item.color}`}>{item.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Star distribution */}
                    {s && (
                      <div className="rounded-xl border p-3 space-y-1.5">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">星等分佈</p>
                        {[
                          { label: "5 ★", count: s.five_star, color: "bg-emerald-400" },
                          { label: "4 ★", count: s.four_star, color: "bg-blue-400" },
                          { label: "3 ★", count: s.three_star, color: "bg-yellow-400" },
                          { label: "1-2 ★", count: s.bad_count, color: "bg-red-400" },
                        ].map(row => (
                          <div key={row.label} className="flex items-center gap-2 text-xs">
                            <span className="w-10 text-muted-foreground shrink-0">{row.label}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Number(s.total) > 0 ? Math.round(Number(row.count) / Number(s.total) * 100) : 0}%` }} />
                            </div>
                            <span className="w-4 text-right font-medium">{row.count}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Per-driver breakdown */}
                    {vehicleDetail.byDriver?.length > 0 && (
                      <div className="rounded-xl border p-3">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">使用此車的司機評分</p>
                        <div className="divide-y">
                          {vehicleDetail.byDriver.map((d: any) => (
                            <div key={d.driver_id} className="flex items-center justify-between py-2">
                              <span className="font-medium">{d.driver_name}</span>
                              <div className="flex items-center gap-3">
                                <span className={`font-bold ${parseFloat(d.avg_stars) >= 4.5 ? "text-emerald-600" : parseFloat(d.avg_stars) >= 3.5 ? "text-blue-600" : "text-red-600"}`}>
                                  ★ {parseFloat(d.avg_stars).toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">{d.rating_count} 筆</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent reviews */}
                    {vehicleDetail.recent?.length > 0 && (
                      <div className="rounded-xl border p-3">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">最近評分記錄</p>
                        <div className="space-y-2">
                          {vehicleDetail.recent.slice(0, 8).map((r: any, i: number) => (
                            <div key={i} className={`rounded-lg px-3 py-2 text-xs ${r.stars >= 4 ? "bg-emerald-50 border border-emerald-100" : r.stars === 3 ? "bg-yellow-50 border border-yellow-100" : "bg-red-50 border border-red-100"}`}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className={`font-bold ${r.stars >= 4 ? "text-emerald-700" : r.stars === 3 ? "text-yellow-700" : "text-red-700"}`}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                                <span className="text-muted-foreground">{r.driver_name} · {format(new Date(r.created_at), "MM/dd")}</span>
                              </div>
                              {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSelectedVehiclePlate(null); setVehicleDetail(null); }}>關閉</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── 評分獎罰事件面板 ─── */}
          {perfEvents.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />
                  客戶評分・獎罰事件
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{perfEvents.length} 筆</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {perfEvents.slice(0, 10).map((evt: any) => (
                    <div key={evt.id} className="flex items-start gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        evt.event_level === "reward" ? "bg-emerald-100" : "bg-red-100"
                      }`}>
                        {evt.event_level === "reward"
                          ? <Star className="w-4 h-4 text-emerald-600" />
                          : <AlertTriangle className="w-4 h-4 text-red-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{evt.title}</p>
                        <p className="text-xs text-muted-foreground">{evt.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">司機：{evt.driver_name} · {format(new Date(evt.created_at), "MM/dd HH:mm")}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {evt.is_resolved ? (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">已處理</span>
                        ) : (
                          <button
                            className="text-xs text-primary border border-primary/30 px-2 py-0.5 rounded-full hover:bg-primary/10 transition-colors"
                            onClick={async () => {
                              await fetch(apiUrl(`/ratings/performance-events/${evt.id}/resolve`), { method: "PATCH" });
                              setPerfEvents(prev => prev.map(e => e.id === evt.id ? { ...e, is_resolved: true } : e));
                            }}
                          >
                            標記處理
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== 客戶 TAB ===== */}
        <TabsContent value="customers" className="outline-none space-y-3">
          {/* ── 待審核客戶/企業申請 ── */}
          {(() => {
            const pending = (customers ?? []).filter(c => (c as any).isActive === false || (c as any).is_active === false);
            if (!pending.length) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Bell className="w-4 h-4" />
                  待審核帳號申請（{pending.length} 筆）
                </div>
                <div className="space-y-1.5">
                  {pending.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 shadow-sm border border-amber-100">
                      <div>
                        <span className="font-semibold text-sm text-gray-800">{c.name}</span>
                        {(c as any).taxId && <span className="ml-1.5 text-[11px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">企業</span>}
                        <span className="ml-2 text-xs text-gray-500">{c.phone}</span>
                        {c.contactPerson && <span className="ml-2 text-xs text-gray-400">聯絡人：{c.contactPerson}</span>}
                      </div>
                      <Button size="sm" className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                        onClick={() => updateCustomer({ id: c.id, data: { isActive: true } as any })}>
                        <CheckCircle className="w-3.5 h-3.5" /> 啟動
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── 合約企業帳號管理 ── */}
          <div className="border border-blue-200 rounded-xl bg-blue-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
                <Building2 className="w-4 h-4" />
                合約企業帳號（{enterpriseAccounts.length} 個）
              </div>
              <Button size="sm" className="h-7 px-3 text-xs gap-1 bg-blue-700 hover:bg-blue-800 text-white"
                onClick={() => { setEnterpriseCreateOpen(true); setEnterpriseCreateForm({ accountCode: "", companyName: "", contactPerson: "", phone: "", password: "", billingType: "monthly", discountPercent: "0" }); }}>
                <UserPlus className="w-3 h-3" /> 新增企業帳號
              </Button>
            </div>
            {enterpriseAccounts.length === 0 ? (
              <p className="text-xs text-blue-500 text-center py-2">尚無企業帳號，請點擊「新增企業帳號」建立。</p>
            ) : (
              <div className="space-y-1.5">
                {enterpriseAccounts.map(acc => (
                  <div key={acc.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 shadow-sm border border-blue-100">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-gray-800 truncate">{acc.companyName}</span>
                      <span className="ml-2 text-xs font-mono text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">{acc.accountCode}</span>
                      <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded font-medium ${acc.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {acc.status === "active" ? "啟用" : "停用"}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs gap-1"
                        onClick={() => openEnterpriseEdit(acc)}>
                        <Pencil className="w-3 h-3" /> 編輯
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs gap-1"
                        onClick={() => { setEnterprisePwDialog({ id: acc.id, companyName: acc.companyName, accountCode: acc.accountCode }); setEnterprisePwInput(""); }}>
                        <KeyRound className="w-3 h-3" /> 密碼
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Dialog open={enterpriseCreateOpen} onOpenChange={setEnterpriseCreateOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>新增合約企業帳號</DialogTitle>
                <DialogDescription>建立企業客戶的登入帳號，完成後企業可使用公司帳號登入。</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">公司帳號代碼 *</label>
                    <Input placeholder="例：CORP001" value={enterpriseCreateForm.accountCode}
                      onChange={e => setEnterpriseCreateForm(f => ({ ...f, accountCode: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">公司名稱 *</label>
                    <Input placeholder="XX股份有限公司" value={enterpriseCreateForm.companyName}
                      onChange={e => setEnterpriseCreateForm(f => ({ ...f, companyName: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">聯絡人</label>
                    <Input placeholder="王大明" value={enterpriseCreateForm.contactPerson}
                      onChange={e => setEnterpriseCreateForm(f => ({ ...f, contactPerson: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">電話</label>
                    <Input placeholder="0912345678" value={enterpriseCreateForm.phone}
                      onChange={e => setEnterpriseCreateForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">付款方式</label>
                    <select className="w-full h-9 px-3 text-sm border rounded-md bg-white"
                      value={enterpriseCreateForm.billingType}
                      onChange={e => setEnterpriseCreateForm(f => ({ ...f, billingType: e.target.value }))}>
                      <option value="monthly">月結</option>
                      <option value="prepaid">預付</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">折扣 (%)</label>
                    <Input type="number" min="0" max="100" placeholder="0" value={enterpriseCreateForm.discountPercent}
                      onChange={e => setEnterpriseCreateForm(f => ({ ...f, discountPercent: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">登入密碼 *</label>
                  <Input type="password" placeholder="請設定初始密碼" value={enterpriseCreateForm.password}
                    onChange={e => setEnterpriseCreateForm(f => ({ ...f, password: e.target.value }))}
                    autoComplete="new-password" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEnterpriseCreateOpen(false)}>取消</Button>
                <Button onClick={createEnterpriseAccount}
                  disabled={!enterpriseCreateForm.accountCode.trim() || !enterpriseCreateForm.companyName.trim() || !enterpriseCreateForm.password.trim() || enterpriseCreateSaving}>
                  {enterpriseCreateSaving ? "建立中..." : "建立帳號"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!enterprisePwDialog} onOpenChange={open => { if (!open) setEnterprisePwDialog(null); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>重設企業登入密碼</DialogTitle>
                <DialogDescription>
                  {enterprisePwDialog?.companyName}（{enterprisePwDialog?.accountCode}）
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <label className="text-sm font-medium text-gray-700 block">新密碼</label>
                <Input
                  type="password"
                  placeholder="請輸入新密碼"
                  value={enterprisePwInput}
                  onChange={e => setEnterprisePwInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEnterprisePassword(); }}
                  autoComplete="new-password"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEnterprisePwDialog(null)}>取消</Button>
                <Button onClick={saveEnterprisePassword} disabled={!enterprisePwInput.trim() || enterprisePwSaving}>
                  {enterprisePwSaving ? "儲存中..." : "確認更新"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── 企業帳號完整編輯 Dialog ── */}
          <Dialog open={!!enterpriseEditDialog} onOpenChange={open => { if (!open) setEnterpriseEditDialog(null); }}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>編輯企業帳號資料</DialogTitle>
                <DialogDescription>{enterpriseEditDialog?.companyName}（{enterpriseEditDialog?.accountCode}）</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-2">
                {/* 基本資料 */}
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">基本聯絡資料</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">公司名稱 *</label>
                      <Input value={enterpriseEditForm.companyName} onChange={e => setEnterpriseEditForm(f => ({ ...f, companyName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">公司簡稱</label>
                      <Input placeholder="例：福興高" value={enterpriseEditForm.shortName} onChange={e => setEnterpriseEditForm(f => ({ ...f, shortName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">聯絡人</label>
                      <Input value={enterpriseEditForm.contactPerson} onChange={e => setEnterpriseEditForm(f => ({ ...f, contactPerson: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">聯絡電話</label>
                      <Input value={enterpriseEditForm.phone} onChange={e => setEnterpriseEditForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">電子信箱</label>
                      <Input type="email" value={enterpriseEditForm.email} onChange={e => setEnterpriseEditForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">行業別</label>
                      <Input placeholder="例：電商物流、製造業" value={enterpriseEditForm.industry} onChange={e => setEnterpriseEditForm(f => ({ ...f, industry: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {/* 法務資料 */}
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">公司法務資料</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">統一編號</label>
                      <Input value={enterpriseEditForm.taxId} onChange={e => setEnterpriseEditForm(f => ({ ...f, taxId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">發票抬頭</label>
                      <Input value={enterpriseEditForm.invoiceTitle} onChange={e => setEnterpriseEditForm(f => ({ ...f, invoiceTitle: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">通訊地址</label>
                      <Input value={enterpriseEditForm.address} onChange={e => setEnterpriseEditForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">郵遞區號</label>
                      <Input value={enterpriseEditForm.postalCode} onChange={e => setEnterpriseEditForm(f => ({ ...f, postalCode: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {/* 帳款條件 */}
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">帳款條件</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">結帳方式</label>
                      <select className="w-full h-9 px-3 text-sm border rounded-md bg-white" value={enterpriseEditForm.billingType} onChange={e => setEnterpriseEditForm(f => ({ ...f, billingType: e.target.value }))}>
                        <option value="monthly">月結</option>
                        <option value="prepaid">預付</option>
                        <option value="cash">現金</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">付款方式</label>
                      <Input placeholder="例：匯款、支票" value={enterpriseEditForm.paymentType} onChange={e => setEnterpriseEditForm(f => ({ ...f, paymentType: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">月結額度 (NT$)</label>
                      <Input type="number" min="0" placeholder="0" value={enterpriseEditForm.creditLimit} onChange={e => setEnterpriseEditForm(f => ({ ...f, creditLimit: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">帳期天數</label>
                      <Input type="number" min="0" placeholder="30" value={enterpriseEditForm.creditDays} onChange={e => setEnterpriseEditForm(f => ({ ...f, creditDays: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">月結日（每月幾號）</label>
                      <Input type="number" min="1" max="31" placeholder="5" value={enterpriseEditForm.monthlyStatementDay} onChange={e => setEnterpriseEditForm(f => ({ ...f, monthlyStatementDay: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">折扣 (%)</label>
                      <Input type="number" min="0" max="100" step="0.1" placeholder="0" value={enterpriseEditForm.discountPercent} onChange={e => setEnterpriseEditForm(f => ({ ...f, discountPercent: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">價格等級</label>
                      <Input placeholder="例：A級、VIP、標準" value={enterpriseEditForm.priceLevel} onChange={e => setEnterpriseEditForm(f => ({ ...f, priceLevel: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">固定單價 (NT$)</label>
                      <Input type="number" min="0" placeholder="0" value={enterpriseEditForm.unitPriceFixed} onChange={e => setEnterpriseEditForm(f => ({ ...f, unitPriceFixed: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">最低月消費 (NT$)</label>
                      <Input type="number" min="0" placeholder="0" value={enterpriseEditForm.minMonthlySpend} onChange={e => setEnterpriseEditForm(f => ({ ...f, minMonthlySpend: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {/* 合約資訊 */}
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">合約資訊</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">合約類型</label>
                      <Input placeholder="例：年約、月約" value={enterpriseEditForm.contractType} onChange={e => setEnterpriseEditForm(f => ({ ...f, contractType: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">合約開始日</label>
                      <Input type="date" value={enterpriseEditForm.contractStart} onChange={e => setEnterpriseEditForm(f => ({ ...f, contractStart: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">合約到期日</label>
                      <Input type="date" value={enterpriseEditForm.contractEnd} onChange={e => setEnterpriseEditForm(f => ({ ...f, contractEnd: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {/* 特殊設定 */}
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">特殊設定與備註</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" className="w-4 h-4 rounded accent-blue-600" checked={!!enterpriseEditForm.priorityDispatch} onChange={e => setEnterpriseEditForm(f => ({ ...f, priorityDispatch: e.target.checked }))} />
                      <span className="text-sm font-medium text-gray-700">優先派車</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" className="w-4 h-4 rounded accent-yellow-500" checked={!!enterpriseEditForm.isVip} onChange={e => setEnterpriseEditForm(f => ({ ...f, isVip: e.target.checked }))} />
                      <span className="text-sm font-medium text-gray-700">VIP 客戶</span>
                    </label>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">帳號狀態</label>
                      <select className="w-full h-9 px-3 text-sm border rounded-md bg-white" value={enterpriseEditForm.status} onChange={e => setEnterpriseEditForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="active">啟用</option>
                        <option value="suspended">停用</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">專屬服務說明</label>
                      <Textarea rows={2} value={enterpriseEditForm.exclusiveNote} onChange={e => setEnterpriseEditForm(f => ({ ...f, exclusiveNote: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">備註</label>
                      <Textarea rows={2} value={enterpriseEditForm.notes} onChange={e => setEnterpriseEditForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEnterpriseEditDialog(null)}>取消</Button>
                <Button onClick={saveEnterpriseEdit} disabled={!enterpriseEditForm.companyName.trim() || enterpriseEditSaving}>
                  {enterpriseEditSaving ? "儲存中..." : "儲存變更"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="搜尋名稱、電話、聯絡人、帳號..."
                className="w-full h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
              {customerSearch && (
                <button onClick={() => setCustomerSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => { setImportDialogTab("customers"); setImportDialogOpen(true); }}>
                <Upload className="w-3.5 h-3.5" /> 批量匯入
              </Button>
            <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 h-9">
                  <UserPlus className="w-3.5 h-3.5" /> 新增客戶
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新增客戶資料</DialogTitle>
                  <DialogDescription>填寫客戶基本資料與登入帳號密碼</DialogDescription>
                </DialogHeader>
                <Form {...createCustomerForm}>
                  <form onSubmit={createCustomerForm.handleSubmit(onCreateCustomerSubmit)} className="space-y-4 py-2">
                    <CustomerFormFields form={createCustomerForm} />
                    <DialogFooter className="pt-2">
                      <Button type="submit" disabled={creatingCustomer} className="w-full">
                        {creatingCustomer ? "儲存中..." : "建立客戶檔案"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          <Dialog open={!!editingCustomer} onOpenChange={(open) => { if (!open) setEditingCustomer(null); }}>
            <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>編輯客戶資料</DialogTitle>
                <DialogDescription>修改客戶基本資料與登入帳號密碼</DialogDescription>
              </DialogHeader>
              <Form {...editCustomerForm}>
                <form onSubmit={editCustomerForm.handleSubmit(onEditCustomerSubmit)} className="space-y-4 py-2">
                  <CustomerFormFields form={editCustomerForm} isEdit />
                  <DialogFooter className="pt-2">
                    <Button type="submit" disabled={updatingCustomer} className="w-full">
                      {updatingCustomer ? "儲存中..." : "儲存變更"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">名稱 / 電話</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">聯絡人</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">地址</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">統編</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">帳號</th>
                    <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">建立時間</th>
                    <th className="px-3 py-2.5 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {customersLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted/60 rounded animate-pulse w-20" /></td>)}</tr>
                    ))
                  ) : filteredCustomers.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-sm">
                      {customerSearch ? "沒有符合搜尋的客戶" : "尚無客戶資料，請新增"}
                    </td></tr>
                  ) : filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/25 transition-colors group">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-foreground text-sm">
                          {customer.name}
                          {(customer as any).short_name && <span className="text-muted-foreground font-normal text-xs ml-1">（{(customer as any).short_name}）</span>}
                        </div>
                        <div className="text-muted-foreground font-mono text-xs">{customer.phone}</div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {(customer as any).contactPerson ? (
                          <span className="text-xs">{(customer as any).contactPerson}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell max-w-[140px]">
                        {(customer as any).address ? (
                          <span className="text-xs truncate block" title={(customer as any).address}>{(customer as any).address}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {(customer as any).taxId ? (
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{(customer as any).taxId}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {customer.username ? (
                          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{customer.username}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <div className="text-xs text-muted-foreground">{format(new Date(customer.createdAt), "MM/dd HH:mm")}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" onClick={() => openEditCustomerDialog(customer)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteCustomer(customer.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== 報表 TAB ===== */}
        <TabsContent value="report" className="outline-none">
          <ReportCenter />
        </TabsContent>

        {/* ===== KPI 儀表板 TAB ===== */}
        <TabsContent value="kpi" className="outline-none">
          <KPIDashboardTab />
        </TabsContent>

        {/* ===== 車型庫 TAB ===== */}
        <TabsContent value="vehicles" className="outline-none">
          <VehicleTypeTab />
        </TabsContent>

        {/* ===== 智慧調度 TAB ===== */}
        <TabsContent value="smart" className="outline-none">
          <SmartDispatchTab />
        </TabsContent>

        {/* ===== 熱區地圖 TAB ===== */}
        <TabsContent value="heatmap" className="outline-none">
          <HeatMapTab />
        </TabsContent>

        {/* ===== 車隊地圖 TAB ===== */}
        <TabsContent value="fleetmap" className="outline-none">
          <FleetMapTab />
        </TabsContent>

        {/* ===== 拼車調度 TAB ===== */}
        <TabsContent value="carpool" className="outline-none">
          <CarpoolTab />
        </TabsContent>

        {/* ===== AI 分析 TAB ===== */}
        <TabsContent value="ai" className="outline-none">
          <AIAnalyticsTab />
        </TabsContent>

        {/* ===== 車隊管理 TAB ===== */}
        <TabsContent value="fleet" className="outline-none">
          <FleetManagementTab />
        </TabsContent>

        {/* ===== 轉單變現 TAB ===== */}
        <TabsContent value="outsourcing" className="outline-none">
          <OutsourcingTab />
        </TabsContent>

        {/* ===== 金流收款 TAB ===== */}
        <TabsContent value="payment" className="outline-none">
          <PaymentCenter />
        </TabsContent>

        {/* ===== 報價試算 TAB ===== */}
        <TabsContent value="quotation" className="outline-none">
          <QuotationTab />
        </TabsContent>

        {/* ===== 報價管理 TAB ===== */}
        <TabsContent value="quotes" className="outline-none">
          <QuotesTab />
        </TabsContent>

        {/* ===== 路線報價表 TAB ===== */}
        <TabsContent value="routeprice" className="outline-none">
          <RoutePriceTab />
        </TabsContent>

        {/* ===== 車輛成本計算 TAB ===== */}
        <TabsContent value="vehiclecost" className="outline-none">
          <VehicleCostTab />
        </TabsContent>

        {/* ===== 派單優化 TAB ===== */}
        <TabsContent value="dispatch" className="outline-none">
          <DispatchOptimizerTab />
        </TabsContent>

        {/* ===== 加盟審核 TAB ===== */}
        <TabsContent value="join" className="outline-none">
          <DriverApplicationsTab />
        </TabsContent>

        {/* ===== 加盟主管理 TAB ===== */}
        <TabsContent value="franchisee" className="outline-none">
          <FranchiseeTab />
        </TabsContent>

        {/* ===== 金流拆解 TAB ===== */}
        <TabsContent value="cashflow" className="outline-none">
          <CashFlowTab />
        </TabsContent>

        {/* ===== 訂單金流閉環 TAB ===== */}
        <TabsContent value="billingflow" className="outline-none">
          <BillingFlowTab />
        </TabsContent>

        {/* ===== API 開放接口 TAB ===== */}
        <TabsContent value="openapi" className="outline-none">
          <OpenApiTab />
        </TabsContent>

        {/* ===== 廠商管理 TAB ===== */}
        <TabsContent value="crm" className="outline-none">
          <CustomerManagementTab />
        </TabsContent>

        {/* ===== 權限管理 TAB ===== */}
        <TabsContent value="perm" className="outline-none">
          <PermissionTab />
        </TabsContent>

        {/* ===== LINE 接單整合 TAB ===== */}
        <TabsContent value="line" className="outline-none">
          <LineManagementTab />
        </TabsContent>

        {/* ===== 系統設定 TAB ===== */}
        <TabsContent value="system" className="outline-none">
          <SystemSettingsTab />
        </TabsContent>

        {/* ===== 電子發票 TAB ===== */}
        <TabsContent value="invoice" className="outline-none">
          <InvoiceManagementTab />
        </TabsContent>

        {/* ===== 競標比價 TAB ===== */}
        <TabsContent value="bidding" className="outline-none">
          <BiddingTab />
        </TabsContent>

        {/* ===== 車隊入駐 TAB ===== */}
        <TabsContent value="fleetreg" className="outline-none">
          <FleetRegistrationTab />
        </TabsContent>

        {/* ===== 績效稽核 TAB ===== */}
        <TabsContent value="performance" className="outline-none">
          <PerformanceAuditTab />
        </TabsContent>

        {/* ===== 碳排報表 TAB ===== */}
        <TabsContent value="carbon" className="outline-none">
          <CarbonReportTab />
        </TabsContent>

        {/* ===== 審批中心 TAB ===== */}
        <TabsContent value="approval" className="outline-none">
          <ApprovalCenterTab />
        </TabsContent>

        {/* ===== 結算中心 TAB ===== */}
        <TabsContent value="settlement" className="outline-none">
          <SettlementCenterTab />
        </TabsContent>

        {/* ===== 毛利分析 TAB ===== */}
        <TabsContent value="cost" className="outline-none">
          <CostAnalysisTab />
        </TabsContent>

        {/* ===== 操作日誌 TAB ===== */}
        <TabsContent value="auditlog" className="outline-none">
          <AuditLogTab />
        </TabsContent>

        {/* ===== 財務報表 TAB ===== */}
        <TabsContent value="finance-reports" className="outline-none">
          <FinanceReportsTab />
        </TabsContent>

        {/* ===== 預測分析 TAB ===== */}
        <TabsContent value="forecast" className="outline-none">
          <DemandForecastTab />
        </TabsContent>

        {/* ===== 站點/車隊架構 TAB ===== */}
        <TabsContent value="zones" className="outline-none">
          <ZoneManagementTab />
        </TabsContent>

        {/* ===== 運營KPI 儀表板 TAB ===== */}
        <TabsContent value="dailyops" className="outline-none">
          <DailyOpsTab />
        </TabsContent>

        {/* ===== 自動分單規則 TAB ===== */}
        <TabsContent value="autorouting" className="outline-none">
          <AutoRoutingTab />
        </TabsContent>

        {/* ===== 路線匯入 TAB ===== */}
        <TabsContent value="routeimport" className="outline-none">
          <RouteImportTab />
        </TabsContent>

        {/* ===== 客戶表單匯入 TAB ===== */}
        <TabsContent value="formimport" className="outline-none">
          <FormImportTab />
        </TabsContent>

        {/* ===== 試算表自動同步 TAB ===== */}
        <TabsContent value="sheetsync" className="outline-none">
          <SheetSyncTab />
        </TabsContent>

        {/* ===== Shopee 罰款管理 TAB ===== */}
        <TabsContent value="penalties" className="outline-none">
          <PenaltiesTab />
        </TabsContent>

        {/* ===== Shopee 報價單 TAB ===== */}
        <TabsContent value="shopeerate" className="outline-none">
          <ShopeeRatesTab />
        </TabsContent>

        {/* ===== 運費試算 TAB ===== */}
        <TabsContent value="driverearnings" className="outline-none">
          <DriverEarningsTab />
        </TabsContent>

        {/* ===== 盈虧分析 TAB ===== */}
        <TabsContent value="pnl" className="outline-none">
          <PnLTab />
        </TabsContent>
      </Tabs>

      <ImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        defaultTab={importDialogTab}
        onSuccess={() => {
          setImportDialogOpen(false);
        }}
      />
    </div>
  );
}
