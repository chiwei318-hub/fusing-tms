/**
 * shopeeDrivers.ts — 蝦皮司機名單管理
 *
 * GET    /api/shopee-drivers           列出全部
 * POST   /api/shopee-drivers           新增
 * POST   /api/shopee-drivers/bulk      批次匯入（ON CONFLICT 更新）
 * PATCH  /api/shopee-drivers/:id       更新
 * DELETE /api/shopee-drivers/:id       刪除
 * GET    /api/shopee-drivers/lookup    以工號查詢
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import multer from "multer";
import { resolveReadableStoragePath } from "../lib/storagePaths";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const shopeeDriversRouter = Router();

// ── 建立 / 升級資料表 ───────────────────────────────────────────────────────
export async function ensureShopeeDriversTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopee_drivers (
      id            SERIAL PRIMARY KEY,
      shopee_id     TEXT NOT NULL UNIQUE,
      name          TEXT,
      vehicle_plate TEXT,
      vehicle_type  TEXT,
      fleet_name    TEXT,
      notes         TEXT,
      is_own_driver BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 升級欄位（舊版沒有這些）
  const addCols = [
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS id_number TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS birthday  TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS address   TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS phone     TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  ];
  for (const sql of addCols) {
    await pool.query(sql).catch(() => {});
  }
}

// ── GET /api/shopee-drivers ─────────────────────────────────────────────────
shopeeDriversRouter.get("/shopee-drivers", async (req, res) => {
  const { q } = req.query as Record<string, string>;
  let where = "";
  const vals: string[] = [];
  if (q) {
    vals.push(`%${q}%`);
    where = `WHERE shopee_id ILIKE $1 OR name ILIKE $1 OR fleet_name ILIKE $1 OR phone ILIKE $1`;
  }
  const { rows } = await pool.query(
    `SELECT id, shopee_id, name, vehicle_plate, vehicle_type, fleet_name,
            id_number, birthday, address, phone, notes, is_own_driver, created_at, updated_at
     FROM shopee_drivers ${where}
     ORDER BY shopee_id`,
    vals
  );
  res.json({ ok: true, drivers: rows, total: rows.length });
});

// ── GET /api/shopee-drivers/lookup?ids=14681,14774 ─────────────────────────
shopeeDriversRouter.get("/shopee-drivers/lookup", async (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, map: {} });
  const { rows } = await pool.query(
    `SELECT shopee_id, name, vehicle_plate, vehicle_type, fleet_name, phone
     FROM shopee_drivers WHERE shopee_id = ANY($1)`,
    [ids]
  );
  const map: Record<string, typeof rows[0]> = {};
  for (const r of rows) map[r.shopee_id] = r;
  res.json({ ok: true, map });
});

// ── POST /api/shopee-drivers ────────────────────────────────────────────────
shopeeDriversRouter.post("/shopee-drivers", async (req, res) => {
  const {
    shopee_id, name = null, vehicle_plate = null, vehicle_type = null,
    fleet_name = null, notes = null, is_own_driver = true,
    id_number = null, birthday = null, address = null, phone = null,
  } = req.body ?? {};
  if (!shopee_id) return res.status(400).json({ error: "shopee_id（工號）為必填" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO shopee_drivers
         (shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
          id_number, birthday, address, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (shopee_id) DO UPDATE SET
         name=$2, vehicle_plate=$3, vehicle_type=$4, fleet_name=$5,
         notes=$6, is_own_driver=$7, id_number=$8, birthday=$9,
         address=$10, phone=$11, updated_at=NOW()
       RETURNING *`,
      [shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
       id_number, birthday, address, phone]
    );
    res.status(201).json({ ok: true, driver: rows[0] });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ── POST /api/shopee-drivers/bulk ───────────────────────────────────────────
shopeeDriversRouter.post("/shopee-drivers/bulk", async (req, res) => {
  const drivers: any[] = req.body?.drivers ?? [];
  if (!Array.isArray(drivers) || !drivers.length)
    return res.status(400).json({ error: "drivers 陣列為必填" });

  let inserted = 0, updated = 0, errors = 0;
  for (const d of drivers) {
    if (!d.shopee_id) continue;
    try {
      const result = await pool.query(
        `INSERT INTO shopee_drivers
           (shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
            id_number, birthday, address, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (shopee_id) DO UPDATE SET
           name=EXCLUDED.name, vehicle_plate=EXCLUDED.vehicle_plate,
           vehicle_type=EXCLUDED.vehicle_type, fleet_name=EXCLUDED.fleet_name,
           notes=EXCLUDED.notes, is_own_driver=EXCLUDED.is_own_driver,
           id_number=EXCLUDED.id_number, birthday=EXCLUDED.birthday,
           address=EXCLUDED.address, phone=EXCLUDED.phone, updated_at=NOW()
         RETURNING (xmax = 0) AS was_inserted`,
        [
          String(d.shopee_id),
          d.name ?? null, d.vehicle_plate ?? null, d.vehicle_type ?? null,
          d.fleet_name ?? null, d.notes ?? null,
          d.is_own_driver !== false,
          d.id_number ?? null, d.birthday ?? null,
          d.address ?? null, d.phone ?? null,
        ]
      );
      if (result.rows[0]?.was_inserted) inserted++; else updated++;
    } catch { errors++; }
  }
  res.json({ ok: true, inserted, updated, errors, total: drivers.length });
});

// ── POST /api/shopee-drivers/import-excel ───────────────────────────────────
// 支援上傳 .xlsx / .xls / .csv，或讀取預設 attached_assets 路徑（不帶檔案時）
shopeeDriversRouter.post(
  "/shopee-drivers/import-excel",
  upload.single("file"),
  async (req: any, res) => {
    let xlsx: any;
    try { xlsx = require("xlsx"); } catch { return res.status(500).json({ error: "xlsx 模組未安裝" }); }

    const drivers: any[] = [];

    // ── 判斷是否為 CSV 格式 ──
    const filename: string = req.file?.originalname ?? "";
    const isCsv = filename.toLowerCase().endsWith(".csv") || (req.file?.mimetype ?? "").includes("csv");

    try {
      if (isCsv && req.file?.buffer) {
        // ── CSV 模式：純文字解析（避免 xlsx 把生日/日期欄自動轉序列數） ──
        // 欄位：工號, 姓名, 身分證, 生日, 手機, 戶籍地址, 車牌, 車型, 車隊, 備注, 身份
        const text = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, ""); // 去 BOM
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inQ = !inQ; }
            else if (line[i] === "," && !inQ) { result.push(cur); cur = ""; }
            else { cur += line[i]; }
          }
          result.push(cur);
          return result.map(s => s.trim());
        };
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return res.json({ ok: true, inserted: 0, updated: 0, errors: 0, total: 0, drivers: [] });
        const header = parseCSVLine(lines[0]);
        const rows = lines.slice(1).map(parseCSVLine);
        const col = (name: string) => header.indexOf(name);

        const iShopeeId    = col("工號");
        const iName        = col("姓名");
        const iIdNumber    = col("身分證");
        const iBirthday    = col("生日");
        const iPhone       = col("手機");
        const iAddress     = col("戶籍地址");
        const iPlate       = col("車牌");
        const iVehicleType = col("車型");
        const iFleet       = col("車隊");
        const iNotes       = col("備注");
        const iStatus      = col("身份");

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i] as any[];
          const shopee_id = String(r[iShopeeId] ?? "").trim();
          if (!shopee_id) continue;

          const status       = String(r[iStatus] ?? "").trim();
          const notesRaw     = String(r[iNotes] ?? "").trim();
          const is_own_driver = status !== "外包" && status !== "外車" && !notesRaw.includes("外車") && !notesRaw.includes("外包");
          const fleet_name   = (iFleet >= 0 ? String(r[iFleet] ?? "").trim() : "") || "蝦皮小楊";

          drivers.push({
            shopee_id,
            name:          iName        >= 0 ? (String(r[iName]        ?? "").trim() || null) : null,
            id_number:     iIdNumber    >= 0 ? (String(r[iIdNumber]    ?? "").trim() || null) : null,
            birthday:      iBirthday    >= 0 ? (String(r[iBirthday]    ?? "").trim() || null) : null,
            phone:         iPhone       >= 0 ? (String(r[iPhone]       ?? "").replace(/[\s\-]/g, "") || null) : null,
            address:       iAddress     >= 0 ? (String(r[iAddress]     ?? "").trim() || null) : null,
            vehicle_plate: iPlate       >= 0 ? (String(r[iPlate]       ?? "").trim() || null) : null,
            vehicle_type:  iVehicleType >= 0 ? (String(r[iVehicleType] ?? "").trim() || null) : null,
            fleet_name,
            notes:         notesRaw || null,
            is_own_driver,
          });
        }
      } else {
        // ── Excel 模式（.xlsx / .xls 或預設附件）──
        let wb: any;
        if (req.file?.buffer) {
          wb = xlsx.read(req.file.buffer, { type: "buffer" });
        } else {
          const p = resolveReadableStoragePath([
            "富詠運輸蝦皮車隊聯絡資料(小楊)115.1.14_1776498724304.xlsx",
            "drivers/富詠運輸蝦皮車隊聯絡資料(小楊)115.1.14_1776498724304.xlsx",
            "data/drivers/富詠運輸蝦皮車隊聯絡資料(小楊)115.1.14_1776498724304.xlsx",
            "cache/drivers/富詠運輸蝦皮車隊聯絡資料(小楊)115.1.14_1776498724304.xlsx",
          ]);
          if (!p) return res.status(404).json({ error: "找不到預設司機 Excel（請放到 data/ 或 cache/）" });
          wb = xlsx.readFile(p);
        }

        // 先嘗試找「蝦皮小楊司機聯絡資料」工作表；若不存在則用第一張
        const sheetName = wb.SheetNames.includes("蝦皮小楊司機聯絡資料")
          ? "蝦皮小楊司機聯絡資料"
          : wb.SheetNames[0];
        const driverSheet = wb.Sheets[sheetName];
        if (!driverSheet) return res.status(400).json({ error: `找不到工作表：${sheetName}` });

        const rows: any[][] = xlsx.utils.sheet_to_json(driverSheet, { header: 1, defval: "" });

        // 自動偵測標題列 vs. 固定格式
        const firstRow = (rows[0] as any[]).map(c => String(c).trim());
        if (firstRow.includes("工號") || firstRow.includes("蝦皮工號")) {
          // 標題式 CSV-like Excel
          const header = firstRow;
          const col = (name: string) => header.findIndex(h => h.includes(name));
          const iShopeeId = col("工號"); const iName = col("姓名"); const iId = col("身分證");
          const iBday = col("生日"); const iPhone = col("手機"); const iAddr = col("戶籍");
          const iPlate = col("車牌"); const iType = col("車型"); const iFleet = col("車隊");
          const iNotes = col("備注"); const iStatus = col("身份");
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i] as any[];
            const shopee_id = String(r[iShopeeId] ?? "").trim();
            if (!shopee_id) continue;
            const status = String(r[iStatus] ?? "").trim();
            const notesRaw = String(r[iNotes] ?? "").trim();
            drivers.push({
              shopee_id,
              name: iName >= 0 ? (String(r[iName] ?? "").trim() || null) : null,
              id_number: iId >= 0 ? (String(r[iId] ?? "").trim() || null) : null,
              birthday: iBday >= 0 ? (String(r[iBday] ?? "").trim() || null) : null,
              phone: iPhone >= 0 ? (String(r[iPhone] ?? "").replace(/[\s\-]/g, "") || null) : null,
              address: iAddr >= 0 ? (String(r[iAddr] ?? "").trim() || null) : null,
              vehicle_plate: iPlate >= 0 ? (String(r[iPlate] ?? "").trim() || null) : null,
              vehicle_type: iType >= 0 ? (String(r[iType] ?? "").trim() || null) : null,
              fleet_name: (iFleet >= 0 ? String(r[iFleet] ?? "").trim() : "") || "蝦皮小楊",
              notes: notesRaw || null,
              is_own_driver: status !== "外包" && status !== "外車" && !notesRaw.includes("外車"),
            });
          }
        } else {
          // 舊版固定欄位格式：[項次, 蝦皮工號, 司機姓名, 車號, 身分證, 生日, 戶籍地址, 手機, 備註]
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            const shopee_id = String(r[1] ?? "").trim();
            if (!shopee_id || shopee_id === "0") continue;
            const notesRaw = String(r[8] ?? "").trim();
            drivers.push({
              shopee_id,
              name:          String(r[2] ?? "").trim() || null,
              vehicle_plate: String(r[3] ?? "").trim() || null,
              id_number:     String(r[4] ?? "").trim() || null,
              birthday:      String(r[5] ?? "").trim() || null,
              address:       String(r[6] ?? "").trim() || null,
              phone:         String(r[7] ?? "").replace(/\s/g, "") || null,
              notes:         notesRaw || null,
              fleet_name:    "蝦皮小楊",
              is_own_driver: !notesRaw.includes("外車") && !notesRaw.includes("外包"),
            });
          }
        }
      }
    } catch (e: any) {
      return res.status(400).json({ error: `無法解析檔案: ${e.message}` });
    }

    if (drivers.length === 0) return res.json({ ok: true, inserted: 0, updated: 0, errors: 0, total: 0, drivers: [] });

    let inserted = 0, updated = 0, errors = 0;
    for (const d of drivers) {
      try {
        const result = await pool.query(
          `INSERT INTO shopee_drivers
             (shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
              id_number, birthday, address, phone)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (shopee_id) DO UPDATE SET
             name=EXCLUDED.name, vehicle_plate=EXCLUDED.vehicle_plate,
             vehicle_type=EXCLUDED.vehicle_type,
             fleet_name=EXCLUDED.fleet_name, notes=EXCLUDED.notes,
             is_own_driver=EXCLUDED.is_own_driver,
             id_number=EXCLUDED.id_number, birthday=EXCLUDED.birthday,
             address=EXCLUDED.address, phone=EXCLUDED.phone,
             updated_at=NOW()
           RETURNING (xmax = 0) AS was_inserted`,
          [d.shopee_id, d.name, d.vehicle_plate, d.vehicle_type ?? null, d.fleet_name, d.notes,
           d.is_own_driver, d.id_number, d.birthday, d.address, d.phone]
        );
        if (result.rows[0]?.was_inserted) inserted++; else updated++;
      } catch { errors++; }
    }

    res.json({ ok: true, inserted, updated, errors, total: drivers.length, drivers });
  }
);

// ── PATCH /api/shopee-drivers/:id ──────────────────────────────────────────
shopeeDriversRouter.patch("/shopee-drivers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = [
    "shopee_id", "name", "vehicle_plate", "vehicle_type", "fleet_name",
    "notes", "is_own_driver", "id_number", "birthday", "address", "phone",
  ];
  const updates = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f} = $${vals.length}`); }
  }
  if (vals.length === 0) return res.status(400).json({ error: "沒有要更新的欄位" });
  vals.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE shopee_drivers SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: "找不到此司機" });
    res.json({ ok: true, driver: rows[0] });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── DELETE /api/shopee-drivers/:id ─────────────────────────────────────────
shopeeDriversRouter.delete("/shopee-drivers/:id", async (req, res) => {
  await pool.query("DELETE FROM shopee_drivers WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});
