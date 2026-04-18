/**
 * platformRequirements.ts — 物流媒合平台客戶需求確認表
 *
 * GET   /api/platform-requirements           列出全部功能項目
 * PATCH /api/platform-requirements/:id       更新「是否需要」與備註
 * POST  /api/platform-requirements/reset     重設所有選項
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const platformRequirementsRouter = Router();

// ── 種子資料 ─────────────────────────────────────────────────────────────
const SEED = [
  // 貨主端
  { seq: 1,  category: "貨主端(App/Web)",   feature: "快速下單",         description: "輸入上下貨地點、貨物規格、車型、時間選項" },
  { seq: 2,  category: "貨主端(App/Web)",   feature: "訂單追蹤",         description: "地圖即時追蹤、司機資訊、到達時間預估" },
  { seq: 3,  category: "貨主端(App/Web)",   feature: "歷史紀錄與對帳",   description: "出貨記錄、費用明細、發票查詢" },
  { seq: 4,  category: "貨主端(App/Web)",   feature: "上傳特殊貨照片",   description: "不規則貨物上傳 → 系統估價 + 人工覆核" },
  // 司機端
  { seq: 5,  category: "司機端(App)",       feature: "任務管理",         description: "任務列表：可接單區、進行中、已完成" },
  { seq: 6,  category: "司機端(App)",       feature: "任務詳情",         description: "顯示收貨人、地點、貨物資訊、金額" },
  { seq: 7,  category: "司機端(App)",       feature: "交貨證明(POD)",    description: "簽收照片上傳、備註填寫" },
  { seq: 8,  category: "司機端(App)",       feature: "收入統計",         description: "日/週/月 收入報表" },
  { seq: 9,  category: "司機端(App)",       feature: "證照管理",         description: "上傳駕照、危險品證照、廠區入場證；違規點數管理" },
  // 管理後台
  { seq: 10, category: "管理後台",          feature: "訂單分派",         description: "人工/自動派單功能，查看訂單狀況" },
  { seq: 11, category: "管理後台",          feature: "會員管理",         description: "貨主/司機審核，資格查驗" },
  { seq: 12, category: "管理後台",          feature: "財務模組",         description: "自動拆分支付（公司/司機/抽成），生成財務報表" },
  { seq: 13, category: "管理後台",          feature: "數據報表中心",     description: "統計訂單量、成交率、車型使用率、活躍度" },
  { seq: 14, category: "管理後台",          feature: "合規控制",         description: "超載限制、危險品管制、禁運品設定" },
  // 加盟制度
  { seq: 15, category: "加盟制度/投資端",   feature: "加盟申請（司機線）", description: "有駕照即可申請，教育訓練一天上線" },
  { seq: 16, category: "加盟制度/投資端",   feature: "推薦獎金制度",     description: "推薦新司機永久抽成2%+次層1%" },
  { seq: 17, category: "加盟制度/投資端",   feature: "投資加盟（養車線）", description: "5萬/單位起投，投資不跑貨僅領分紅" },
  { seq: 18, category: "加盟制度/投資端",   feature: "投資分紅管理",     description: "自動計算每月分紅，投資人報表+匯款" },
  // 技術需求
  { seq: 19, category: "技術需求",          feature: "登入",             description: "手機號＋簡訊驗證登入" },
  { seq: 20, category: "技術需求",          feature: "導航",             description: "Google Map 導航、地點選點" },
  { seq: 21, category: "技術需求",          feature: "通知",             description: "LINE Notify / App 通知" },
  { seq: 22, category: "技術需求",          feature: "金流串接",         description: "信用卡、Line Pay、電子發票" },
  { seq: 23, category: "技術需求",          feature: "POD 上傳",         description: "簽收照片存檔" },
];

// ── 建立資料表 ───────────────────────────────────────────────────────────
export async function ensurePlatformRequirementsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_requirements (
      id          SERIAL PRIMARY KEY,
      seq         INTEGER    NOT NULL,
      category    TEXT       NOT NULL,
      feature     TEXT       NOT NULL,
      description TEXT       NOT NULL,
      is_needed   TEXT       NOT NULL DEFAULT 'pending',  -- pending | yes | no
      notes       TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query("SELECT COUNT(*) FROM platform_requirements");
  if (Number(rows[0].count) === 0) {
    for (const r of SEED) {
      await pool.query(
        `INSERT INTO platform_requirements (seq, category, feature, description, is_needed)
         VALUES ($1,$2,$3,$4,'pending')`,
        [r.seq, r.category, r.feature, r.description]
      );
    }
    console.log(`[PlatformReq] 已種入 ${SEED.length} 筆功能需求確認項目`);
  }
}

// ── GET /api/platform-requirements ────────────────────────────────────────
platformRequirementsRouter.get("/platform-requirements", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM platform_requirements ORDER BY seq"
  );
  res.json({ ok: true, items: rows });
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

// ── POST /api/platform-requirements/reset ─────────────────────────────────
platformRequirementsRouter.post("/platform-requirements/reset", async (_req, res) => {
  await pool.query(
    "UPDATE platform_requirements SET is_needed='pending', notes=NULL, updated_at=NOW()"
  );
  res.json({ ok: true });
});
