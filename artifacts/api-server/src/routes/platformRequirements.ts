/**
 * platformRequirements.ts — 物流媒合平台需求確認
 *
 * doc_type:
 *   customer_req  — 客戶需求確認表（5 大類 × 23 項）
 *   architecture  — 程式架構清單（10 大類 × 56 項）
 *
 * GET   /api/platform-requirements?doc_type=...   列出項目
 * PATCH /api/platform-requirements/:id            更新是否需要 + 備注
 * POST  /api/platform-requirements/reset?doc_type=... 重設某文件
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const platformRequirementsRouter = Router();

// ── 客戶需求確認種子 ─────────────────────────────────────────────────────
const CUSTOMER_SEED = [
  { seq:1,  category:"貨主端(App/Web)",   feature:"快速下單",           description:"輸入上下貨地點、貨物規格、車型、時間選項" },
  { seq:2,  category:"貨主端(App/Web)",   feature:"訂單追蹤",           description:"地圖即時追蹤、司機資訊、到達時間預估" },
  { seq:3,  category:"貨主端(App/Web)",   feature:"歷史紀錄與對帳",     description:"出貨記錄、費用明細、發票查詢" },
  { seq:4,  category:"貨主端(App/Web)",   feature:"上傳特殊貨照片",     description:"不規則貨物上傳 → 系統估價 + 人工覆核" },
  { seq:5,  category:"司機端(App)",       feature:"任務管理",           description:"任務列表：可接單區、進行中、已完成" },
  { seq:6,  category:"司機端(App)",       feature:"任務詳情",           description:"顯示收貨人、地點、貨物資訊、金額" },
  { seq:7,  category:"司機端(App)",       feature:"交貨證明(POD)",      description:"簽收照片上傳、備注填寫" },
  { seq:8,  category:"司機端(App)",       feature:"收入統計",           description:"日/週/月收入報表" },
  { seq:9,  category:"司機端(App)",       feature:"證照管理",           description:"上傳駕照、危險品證照、廠區入場證；違規點數管理" },
  { seq:10, category:"管理後台",          feature:"訂單分派",           description:"人工/自動派單功能，查看訂單狀況" },
  { seq:11, category:"管理後台",          feature:"會員管理",           description:"貨主/司機審核，資格查驗" },
  { seq:12, category:"管理後台",          feature:"財務模組",           description:"自動拆分支付（公司/司機/抽成），生成財務報表" },
  { seq:13, category:"管理後台",          feature:"數據報表中心",       description:"統計訂單量、成交率、車型使用率、活躍度" },
  { seq:14, category:"管理後台",          feature:"合規控制",           description:"超載限制、危險品管制、禁運品設定" },
  { seq:15, category:"加盟制度/投資端",   feature:"加盟申請（司機線）", description:"有駕照即可申請，教育訓練一天上線" },
  { seq:16, category:"加盟制度/投資端",   feature:"推薦獎金制度",       description:"推薦新司機永久抽成2%+次層1%" },
  { seq:17, category:"加盟制度/投資端",   feature:"投資加盟（養車線）", description:"5萬/單位起投，投資不跑貨僅領分紅" },
  { seq:18, category:"加盟制度/投資端",   feature:"投資分紅管理",       description:"自動計算每月分紅，投資人報表+匯款" },
  { seq:19, category:"技術需求",          feature:"登入",               description:"手機號＋簡訊驗證登入" },
  { seq:20, category:"技術需求",          feature:"導航",               description:"Google Map 導航、地點選點" },
  { seq:21, category:"技術需求",          feature:"通知",               description:"LINE Notify / App 通知" },
  { seq:22, category:"技術需求",          feature:"金流串接",           description:"信用卡、Line Pay、電子發票" },
  { seq:23, category:"技術需求",          feature:"POD 上傳",           description:"簽收照片存檔" },
].map(r => ({ ...r, doc_type: "customer_req" }));

// ── 程式架構清單種子 ─────────────────────────────────────────────────────
const ARCH_SEED = [
  // 貨主體驗
  { seq:1,  category:"貨主體驗", feature:"即時追蹤＋精準 ETA",       description:"含塞車/臨停/氣候修正；可分享給客戶的一鍵追蹤連結" },
  { seq:2,  category:"貨主體驗", feature:"需求精準化表單",           description:"託運品類（一般/冷鏈/危險品/超尺/敏感電子）、上下車條件（月台/尾門/棧板/室溫）" },
  { seq:3,  category:"貨主體驗", feature:"多點取送與時窗約配",       description:"多站路線、指定時窗、跨日配送" },
  { seq:4,  category:"貨主體驗", feature:"貨損/延誤例外回報",        description:"一鍵理賠申請：上傳照片、時序證據、理賠進度追蹤" },
  { seq:5,  category:"貨主體驗", feature:"報價/合約價自動套用",      description:"動態里程、區域分區、油價/匯率調整因子" },
  { seq:6,  category:"貨主體驗", feature:"快速開單模板與批量匯入",   description:"複製訂單、API/Excel 批量匯入" },
  { seq:7,  category:"貨主體驗", feature:"作業預約 Dock 管理",       description:"Dock 與到站排隊管理" },
  { seq:8,  category:"貨主體驗", feature:"附加費自動計算",           description:"等候費、改單費、搬運費（地點/樓層/距離/工時）" },
  // 司機體驗
  { seq:9,  category:"司機體驗", feature:"離線可用",                 description:"山區/地下室離線模式、弱網自動補送" },
  { seq:10, category:"司機體驗", feature:"智能導航",                 description:"避高限/限重/危險品禁行路段，多點最佳路徑" },
  { seq:11, category:"司機體驗", feature:"ePOD 強化",                description:"簽名/條碼或RFID掃描/時間地點戳記/多張照片/語音備注" },
  { seq:12, category:"司機體驗", feature:"任務變更即時語音提醒",     description:"支援藍牙耳機/車機" },
  { seq:13, category:"司機體驗", feature:"車隊安全＋合規助理",       description:"超速/急煞/疲勞駕駛提醒、工時計（HOS）" },
  { seq:14, category:"司機體驗", feature:"錢包與結算",               description:"里程/趟次/裝卸/等待費即時計算，秒查今日可領金額" },
  { seq:15, category:"司機體驗", feature:"即時通譯",                 description:"跨境任務語音翻譯、多語介面" },
  { seq:16, category:"司機體驗", feature:"任務接單市場",             description:"自由接單/競價/指定優先權，搭配司機評級與准入" },
  // 調度/後台
  { seq:17, category:"調度/後台", feature:"智能自動派車 Auto-Dispatch", description:"依車型、位置、可用時窗、司機評分、歷史準點率、成本模型打分" },
  { seq:18, category:"調度/後台", feature:"異常中心 Exception Center",   description:"延誤/偏航/超時/溫度超標/無人收貨，一鍵補救流程（改約配/換車/回倉/客服外呼）" },
  { seq:19, category:"調度/後台", feature:"合同/價目中心",              description:"對客/對司機雙邊價表、區段里程、階梯式/區間式、燃料附加費、夜間/偏遠/禁區加成" },
  { seq:20, category:"調度/後台", feature:"權限 RBAC 與稽核軌跡",       description:"誰在何時改了什麼，完整操作日誌" },
  { seq:21, category:"調度/後台", feature:"大螢幕作戰圖",               description:"地圖佈局＋甘特視圖：車輛即時狀態、裝/送進度、倉庫/月台容量" },
  { seq:22, category:"調度/後台", feature:"預測性排程",                  description:"用量預測、尖離峰車勢、提前招募/外協建議" },
  { seq:23, category:"調度/後台", feature:"客服工單整合",                description:"電話/LINE/WhatsApp/Email/Chat，SLA 計時與自動回覆範本" },
  // 財務與結算
  { seq:24, category:"財務與結算（雙邊）", feature:"雙邊結算引擎",        description:"對司機（趟次/提成/油資/過路費/獎懲）、對貨主（對帳單/電子發票/稅率/幣別）" },
  { seq:25, category:"財務與結算（雙邊）", feature:"付款整合",            description:"信用卡、銀行轉帳、Line Pay、街口、應收保險/履約保證、COD代收" },
  { seq:26, category:"財務與結算（雙邊）", feature:"自動核單",            description:"ePOD 與 GPS/地理圍欄對時、條碼掃描數量核對" },
  { seq:27, category:"財務與結算（雙邊）", feature:"錢包/即時撥付 Payout", description:"Instant Payout 與風控（反洗錢/KYC）" },
  { seq:28, category:"財務與結算（雙邊）", feature:"爭議/理賠工作流",     description:"時效管控、證據包整合、保險公司 API 串接" },
  // 冷鏈/特殊品
  { seq:29, category:"冷鏈/特殊品", feature:"冷鏈溫度紀錄",     description:"藍牙記錄器/車載探針，超標即時警報與 POD 報告附檔" },
  { seq:30, category:"冷鏈/特殊品", feature:"危險品/高價品合規", description:"資質上傳與到期提醒、限行規則自動避讓" },
  { seq:31, category:"冷鏈/特殊品", feature:"資產追蹤",         description:"棧板/周轉箱/溫控箱（條碼/RFID）追蹤" },
  { seq:32, category:"冷鏈/特殊品", feature:"車況 OBD 整合",    description:"OBD-II/CAN/油耗/胎壓/行車影像事件標記（碰撞自動上報）" },
  // 平台化與整合
  { seq:33, category:"平台化與整合", feature:"開放 API / Webhook / SDK", description:"ERP/WMS/OMS/電商平台串接（跨境/本地）、宅配/快遞對接" },
  { seq:34, category:"平台化與整合", feature:"批量工具",                  description:"CSV/Excel 匯入匯出、模板與欄位對映器" },
  { seq:35, category:"平台化與整合", feature:"單據中心",                  description:"派車單、裝卸清單、BOL/託運單、危險品MSDS、通關文件（跨境）" },
  { seq:36, category:"平台化與整合", feature:"EDI 與海關/港埠整合",       description:"ANSI X12/EDIFACT、海關/保稅、港埠/機場卡口預約" },
  // 成長與信任機制
  { seq:37, category:"成長與信任機制", feature:"用戶評價/投訴/黑名單", description:"准入審核（車齡/保險/證照/犯罪紀錄查驗）" },
  { seq:38, category:"成長與信任機制", feature:"推薦/拉新",           description:"推薦碼、任務獎金、車隊招募漏斗" },
  { seq:39, category:"成長與信任機制", feature:"透明度儀表",         description:"準點率、破損率、溫控合格率、投訴率公開" },
  { seq:40, category:"成長與信任機制", feature:"客戶成功與 NPS",     description:"NPS 調查、企業版 SSO（SAML/OIDC）" },
  // 風險、法規與安全
  { seq:41, category:"風險、法規與安全", feature:"資料隱私與加密",  description:"GDPR/個資、資料加密（靜態/傳輸）、裝置綁定、地理圍欄隱私模式" },
  { seq:42, category:"風險、法規與安全", feature:"可觀測性與備援",  description:"Traces/Metrics/Logs、異地備援與災難復原演練" },
  { seq:43, category:"風險、法規與安全", feature:"欺詐偵測",        description:"鬼點、假完成、假GPS、截圖POD、異常模式學習" },
  { seq:44, category:"風險、法規與安全", feature:"合規報告",        description:"食品/藥品 GDP、危險品運輸、職安衛" },
  // 資料與 AI 助手
  { seq:45, category:"資料與 AI 助手", feature:"需求預測與容量規劃", description:"週期性 + 天氣/活動/促銷事件預測" },
  { seq:46, category:"資料與 AI 助手", feature:"智慧報表",          description:"成本/毛利到車、司機績效雷達、客戶 LTV/貢獻度" },
  { seq:47, category:"資料與 AI 助手", feature:"AI 調度 Copilot",  description:"自動排線、改派建議、與客/司機聊天助理（查單、改時窗、寄送追蹤連結）" },
  { seq:48, category:"資料與 AI 助手", feature:"模擬器",            description:"若增加 N 台 5T 車、油價 ±10% 對 SLA/毛利影響分析" },
  // 國際化與在地化
  { seq:49, category:"國際化與在地化", feature:"多語/多幣/多稅制",    description:"台灣電子發票/載具/捐贈碼/統編抬頭、地址解析支援門牌巷弄" },
  { seq:50, category:"國際化與在地化", feature:"LINE 深度整合",        description:"LINE Notify/官方帳號（開單、到貨提醒、客服）" },
  { seq:51, category:"國際化與在地化", feature:"本地/跨境承運商 API",  description:"黑貓/宅配通/郵局，及跨境物流（快遞、空海運）銜接" },
  // 成功 KPI
  { seq:52, category:"成功 KPI",       feature:"貨主 KPI",   description:"準點率 ≥ 98%、索賠率 ≤ 0.3%、客服工單首響 < 2 分鐘" },
  { seq:53, category:"成功 KPI",       feature:"司機 KPI",   description:"接單至出車平均 < 10 分鐘、空駛率 ↓ 15%" },
  { seq:54, category:"成功 KPI",       feature:"調度 KPI",   description:"手動改派率 < 5%、異常自動化處理率 ≥ 70%" },
  { seq:55, category:"成功 KPI",       feature:"財務 KPI",   description:"核單至請款自動化 ≥ 95%、錯帳率 < 0.2%" },
  { seq:56, category:"成功 KPI",       feature:"平台 KPI",   description:"月留存（司機/貨主）≥ 85%/90%、NPS ≥ 60" },
].map(r => ({ ...r, doc_type: "architecture" }));

// ── 建立資料表 + 遷移 ────────────────────────────────────────────────────
export async function ensurePlatformRequirementsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_requirements (
      id          SERIAL PRIMARY KEY,
      seq         INTEGER    NOT NULL,
      category    TEXT       NOT NULL,
      feature     TEXT       NOT NULL,
      description TEXT       NOT NULL,
      is_needed   TEXT       NOT NULL DEFAULT 'pending',
      notes       TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // 補上 doc_type 欄位（升版遷移，保留舊資料）
  await pool.query(`
    ALTER TABLE platform_requirements
      ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'customer_req'
  `);

  // 種入客戶需求（若尚未有資料）
  const { rows: cr } = await pool.query(
    "SELECT COUNT(*) FROM platform_requirements WHERE doc_type='customer_req'"
  );
  if (Number(cr[0].count) === 0) {
    for (const r of CUSTOMER_SEED) {
      await pool.query(
        `INSERT INTO platform_requirements (seq,category,feature,description,doc_type,is_needed)
         VALUES ($1,$2,$3,$4,$5,'pending')`,
        [r.seq, r.category, r.feature, r.description, r.doc_type]
      );
    }
    console.log(`[PlatformReq] 已種入 ${CUSTOMER_SEED.length} 筆客戶需求確認項目`);
  }

  // 種入程式架構（若尚未有資料）
  const { rows: ar } = await pool.query(
    "SELECT COUNT(*) FROM platform_requirements WHERE doc_type='architecture'"
  );
  if (Number(ar[0].count) === 0) {
    for (const r of ARCH_SEED) {
      await pool.query(
        `INSERT INTO platform_requirements (seq,category,feature,description,doc_type,is_needed)
         VALUES ($1,$2,$3,$4,$5,'pending')`,
        [r.seq, r.category, r.feature, r.description, r.doc_type]
      );
    }
    console.log(`[PlatformReq] 已種入 ${ARCH_SEED.length} 筆程式架構項目`);
  }
}

// ── GET /api/platform-requirements?doc_type=... ───────────────────────────
platformRequirementsRouter.get("/platform-requirements", async (req, res) => {
  const docType = (req.query.doc_type as string) || "customer_req";
  const { rows } = await pool.query(
    "SELECT * FROM platform_requirements WHERE doc_type=$1 ORDER BY seq",
    [docType]
  );
  res.json({ ok: true, doc_type: docType, items: rows });
});

// ── PATCH /api/platform-requirements/:id ──────────────────────────────────
platformRequirementsRouter.patch("/platform-requirements/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { is_needed, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE platform_requirements
     SET is_needed=$1, notes=$2, updated_at=NOW()
     WHERE id=$3 RETURNING *`,
    [is_needed ?? "pending", notes ?? null, id]
  );
  if (!rows.length) return res.status(404).json({ error: "找不到項目" });
  res.json({ ok: true, item: rows[0] });
});

// ── POST /api/platform-requirements/reset?doc_type=... ────────────────────
platformRequirementsRouter.post("/platform-requirements/reset", async (req, res) => {
  const docType = (req.query.doc_type as string) || "customer_req";
  await pool.query(
    "UPDATE platform_requirements SET is_needed='pending', notes=NULL, updated_at=NOW() WHERE doc_type=$1",
    [docType]
  );
  res.json({ ok: true, doc_type: docType });
});
