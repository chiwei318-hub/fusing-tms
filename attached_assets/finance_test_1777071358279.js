/**
 * 財務模組測試腳本
 * 在瀏覽器 Console 貼上執行，確認數字正確
 */

// ══════════════════════════════════════════════════════════════
// TEST 1：試算本月司機薪資（不寫入）
// ══════════════════════════════════════════════════════════════
async function testPayrollPreview() {
  const period = new Date().toISOString().slice(0, 7); // 2026-04
  const res = await fetch(`/api/tax/driver-payroll/preview?period=${period}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  const data = await res.json();
  console.log("=== 司機薪資試算 ===");
  console.table(data);
  return data;
}

// ══════════════════════════════════════════════════════════════
// TEST 2：產生本月薪資單（寫入 DB）
// ══════════════════════════════════════════════════════════════
async function generatePayroll() {
  const period = new Date().toISOString().slice(0, 7);
  const res = await fetch('/api/tax/driver-payroll/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ period, overwrite: false })
  });
  const data = await res.json();
  console.log("=== 薪資單產生結果 ===", data);
  return data;
}

// ══════════════════════════════════════════════════════════════
// TEST 3：查詢財務欄位是否正確計算
// ══════════════════════════════════════════════════════════════
async function checkOrderFinance() {
  const res = await fetch('/api/orders?limit=5', {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  const data = await res.json();
  const orders = Array.isArray(data) ? data : data.data ?? data.orders ?? [];
  console.log("=== 訂單財務欄位驗證 ===");
  orders.slice(0, 5).forEach(o => {
    console.log({
      order_no:       o.order_no,
      total_fee:      o.total_fee,
      cost_amount:    o.cost_amount,
      vat_amount:     o.vat_amount,
      profit_amount:  o.profit_amount,
      fleet_payout:   o.fleet_payout,
    });
  });
}

// ══════════════════════════════════════════════════════════════
// TEST 4：車隊應付款計算
// ══════════════════════════════════════════════════════════════
async function calcFleetPayables() {
  const period = new Date().toISOString().slice(0, 7);
  const res = await fetch('/api/tax/fleet-payables/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ period })
  });
  const data = await res.json();
  console.log("=== 車隊應付款 ===", data);
  return data;
}

// ══════════════════════════════════════════════════════════════
// 一次跑全部測試
// ══════════════════════════════════════════════════════════════
async function runAllTests() {
  console.log("🚀 開始財務模組測試...");
  await checkOrderFinance();
  await testPayrollPreview();
  console.log("✅ 測試完成！如果數字正確，執行 generatePayroll() 正式產生薪資單");
}

// 執行：
runAllTests();
