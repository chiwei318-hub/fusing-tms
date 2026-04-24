/**
 * App.tsx 修改說明
 * 需要修改兩個地方，照下面步驟做
 */

// ══════════════════════════════════════════════════════════════
// STEP 1：在 lazy imports 區塊加入（找到其他 lazy import 的地方）
// ══════════════════════════════════════════════════════════════

const FinanceDashboard = lazy(() => import("@/pages/admin/FinanceDashboard"));

// ══════════════════════════════════════════════════════════════
// STEP 2：在 AdminPortal 的 Switch 裡加入路由
// 找到 <Route path="/dispatch" component={DispatchCenter} />
// 在它下面加：
// ══════════════════════════════════════════════════════════════

// <Route path="/finance" component={FinanceDashboard} />

// ══════════════════════════════════════════════════════════════
// STEP 3：在 AppRouter 函式裡找到這段：
//
//   if (
//     location.startsWith("/admin") ||
//     location.startsWith("/order") ||
//     location.startsWith("/fees") ||
//     location.startsWith("/dispatch")
//   ) {
//
// 加入 /finance：
// ══════════════════════════════════════════════════════════════

/*
if (
  location.startsWith("/admin") ||
  location.startsWith("/order") ||
  location.startsWith("/fees") ||
  location.startsWith("/dispatch") ||
  location.startsWith("/finance")    // ← 加這行
) {
  return <AdminPortal />;
}
*/
