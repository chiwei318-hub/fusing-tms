/**
 * Order Bulk Import via Excel / CSV
 *
 * POST /api/orders/import           — upload + validate + optional commit
 * GET  /api/orders/import-template  — download Excel template
 *
 * Flow:
 *   1. Client downloads the template (GET /template)
 *   2. Fills it in, uploads (POST /import?dry_run=1) → gets row-level validation
 *   3. Confirms → uploads again without dry_run → rows inserted, auto-routing applied
 */
import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { pool } from "@workspace/db";
import { Readable } from "stream";
import { applyAutoRoutingToOrder } from "./autoRouting";

export const orderImportRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Column definition ─────────────────────────────────────────────────────
const REQUIRED_COLS = ["客戶姓名", "客戶電話", "取貨地址", "送貨地址"];
const OPTIONAL_COLS = [
  "貨物描述", "重量(kg)", "車型", "數量", "取貨日期", "取貨時間",
  "送貨日期", "送貨時間", "取貨聯絡人", "送貨聯絡人",
  "取貨聯絡電話", "送貨聯絡電話", "尾板", "液壓拖板車",
  "特殊需求", "費用(元)", "備註", "地區", "郵遞區號",
];
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

const SAMPLE_ROWS = [
  {
    客戶姓名: "王大明", 客戶電話: "0912345678",
    取貨地址: "台北市信義區信義路5段7號",
    送貨地址: "台中市西屯區台灣大道3段99號",
    貨物描述: "電子零件",  "重量(kg)": 200,
    車型: "2.5噸", 數量: 10,
    取貨日期: "2026-03-28", 取貨時間: "09:00",
    送貨日期: "2026-03-28", 送貨時間: "14:00",
    取貨聯絡人: "王小姐", 送貨聯絡人: "李先生",
    取貨聯絡電話: "0912345678", 送貨聯絡電話: "0923456789",
    尾板: "否", 液壓拖板車: "否", 特殊需求: "",
    "費用(元)": 3500, 備註: "", 地區: "中部", 郵遞區號: "407",
  },
  {
    客戶姓名: "陳美華", 客戶電話: "0923456789",
    取貨地址: "新北市板橋區文化路1段188號",
    送貨地址: "桃園市中壢區中山路100號",
    貨物描述: "冷凍食品", "重量(kg)": 500,
    車型: "5噸冷凍", 數量: 30,
    取貨日期: "2026-03-28", 取貨時間: "07:00",
    送貨日期: "2026-03-28", 送貨時間: "11:00",
    取貨聯絡人: "陳小姐", 送貨聯絡人: "林先生",
    取貨聯絡電話: "0923456789", 送貨聯絡電話: "0934567890",
    尾板: "是", 液壓拖板車: "否", 特殊需求: "全程冷鏈2-8°C",
    "費用(元)": 5200, 備註: "注意溫控", 地區: "北部", 郵遞區號: "320",
  },
];

// ── GET /api/orders/import-template ──────────────────────────────────────
orderImportRouter.get("/orders/import-template", async (_req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸";
    wb.created = new Date();

    const ws = wb.addWorksheet("訂單匯入", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });

    // Headers row
    ws.columns = ALL_COLS.map((h) => ({
      header: h,
      key: h,
      width: h.length > 8 ? 20 : 14,
    }));

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNum) => {
      const isRequired = colNum <= REQUIRED_COLS.length;
      cell.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: isRequired ? "FF1A56DB" : "FF4B83D2" },
      };
      cell.font  = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF1A56DB" } },
        right:  { style: "thin", color: { argb: "FFAAAAAA" } },
      };
    });
    headerRow.height = 28;

    // Add required-field note
    const noteRow = ws.addRow(["★ 藍色欄位必填（客戶姓名/電話/取貨地址/送貨地址），其餘選填"]);
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF555555" }, size: 10 };
    ws.mergeCells(`A2:${String.fromCharCode(64 + ALL_COLS.length)}2`);

    // Sample data
    SAMPLE_ROWS.forEach((row, i) => {
      const dataRow = ws.addRow(ALL_COLS.map((col) => (row as Record<string, string | number>)[col] ?? ""));
      dataRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern", pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFF0F4FF" : "FFFFFFFF" },
        };
      });
    });

    // Instructions sheet
    const infoWs = wb.addWorksheet("填寫說明");
    const instructions = [
      ["欄位名稱", "說明", "必填", "格式 / 範例"],
      ["客戶姓名", "下單客戶或公司名稱", "✅", "王大明 / 富詠科技"],
      ["客戶電話", "聯絡電話", "✅", "0912345678"],
      ["取貨地址", "完整取貨地址（含縣市區路號）", "✅", "台北市信義區信義路5段7號"],
      ["送貨地址", "完整送貨地址", "✅", "台中市西屯區台灣大道3段99號"],
      ["貨物描述", "貨物品名或說明", "", "電子零件 / 冷凍食品"],
      ["重量(kg)", "總重量，數字", "", "200"],
      ["車型", "2噸/2.5噸/5噸/10噸/5噸冷凍/半貨/大貨/聯結", "", "2.5噸"],
      ["數量", "件數或箱數，數字", "", "10"],
      ["取貨日期", "YYYY-MM-DD 格式", "", "2026-03-28"],
      ["取貨時間", "HH:MM 格式", "", "09:00"],
      ["送貨日期", "YYYY-MM-DD 格式（若當日到省略可留空）", "", "2026-03-28"],
      ["送貨時間", "HH:MM 格式", "", "14:00"],
      ["取貨聯絡人", "取貨地點聯絡人姓名", "", "王小姐"],
      ["送貨聯絡人", "送貨地點聯絡人姓名", "", "李先生"],
      ["尾板", "是 / 否", "", "否"],
      ["液壓拖板車", "是 / 否", "", "否"],
      ["費用(元)", "合計費用，數字（留空由系統計算）", "", "3500"],
      ["備註", "任何額外說明", "", ""],
      ["地區", "服務區域（北部/中部/南部/東部）", "", "中部"],
      ["郵遞區號", "取貨地址郵遞區號（用於自動分站）", "", "407"],
    ];
    infoWs.columns = [
      { key: "a", width: 18 }, { key: "b", width: 30 },
      { key: "c", width: 8  }, { key: "d", width: 30 },
    ];
    instructions.forEach((row, i) => {
      const r = infoWs.addRow(row);
      if (i === 0) {
        r.font = { bold: true };
        r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A56DB" } };
        r.font = { bold: true, color: { argb: "FFFFFFFF" } };
      } else if (i <= 4) {
        r.getCell(3).font = { color: { argb: "FF16A34A" }, bold: true };
      }
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="order_import_template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/orders/import ───────────────────────────────────────────────
orderImportRouter.post("/orders/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "請上傳檔案" });

  const dryRun = req.query["dry_run"] === "1" || req.query["dryRun"] === "true";

  try {
    const wb = new ExcelJS.Workbook();
    const stream = Readable.from(req.file.buffer);
    const ext = req.file.originalname.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      await wb.csv.read(stream);
    } else {
      await wb.xlsx.read(stream);
    }

    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: "找不到工作表" });

    // Parse headers
    const headerRow = ws.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, col) => {
      const val = String(cell.value ?? "").trim();
      if (val) headers[col] = val;
    });

    const colIndex: Record<string, number> = {};
    Object.entries(headers).forEach(([col, name]) => { colIndex[name] = Number(col); });

    // Check required headers
    const missingHeaders = REQUIRED_COLS.filter((h) => !(h in colIndex));
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        error: `缺少必要欄位：${missingHeaders.join(", ")}`,
        missing_headers: missingHeaders,
      });
    }

    function cellVal(row: ExcelJS.Row, colName: string): string {
      const idx = colIndex[colName];
      if (!idx) return "";
      const cell = row.getCell(idx);
      if (cell.value === null || cell.value === undefined) return "";
      if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
      if (typeof cell.value === "object" && "result" in cell.value) return String((cell.value as {result: unknown}).result ?? "");
      return String(cell.value).trim();
    }

    interface ParsedRow {
      rowNum: number;
      data: Record<string, string>;
      errors: string[];
      valid: boolean;
    }

    const rows: ParsedRow[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return; // skip header + note row

      const data: Record<string, string> = {};
      ALL_COLS.forEach((col) => { data[col] = cellVal(row, col); });

      // Skip completely empty rows
      const hasContent = REQUIRED_COLS.some((c) => data[c]);
      if (!hasContent) return;

      const errors: string[] = [];

      // Validate required fields
      if (!data["客戶姓名"]) errors.push("客戶姓名必填");
      if (!data["客戶電話"]) errors.push("客戶電話必填");
      if (data["客戶電話"] && !/^\d{8,12}$/.test(data["客戶電話"].replace(/-/g, ""))) {
        errors.push("電話格式不正確");
      }
      if (!data["取貨地址"]) errors.push("取貨地址必填");
      if (!data["送貨地址"]) errors.push("送貨地址必填");

      // Date format check
      if (data["取貨日期"] && !/^\d{4}-\d{2}-\d{2}$/.test(data["取貨日期"])) {
        errors.push("取貨日期格式應為 YYYY-MM-DD");
      }
      if (data["送貨日期"] && !/^\d{4}-\d{2}-\d{2}$/.test(data["送貨日期"])) {
        errors.push("送貨日期格式應為 YYYY-MM-DD");
      }
      if (data["重量(kg)"] && isNaN(Number(data["重量(kg)"]))) {
        errors.push("重量必須是數字");
      }

      rows.push({ rowNum, data, errors, valid: errors.length === 0 });
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: "檔案中沒有找到資料（請勿刪除第一二行說明列）" });
    }

    const validRows = rows.filter((r) => r.valid);
    const errorRows = rows.filter((r) => !r.valid);

    // Dry run — return preview
    if (dryRun) {
      return res.json({
        total: rows.length,
        valid: validRows.length,
        errors: errorRows.length,
        rows: rows.map((r) => ({
          rowNum: r.rowNum,
          valid: r.valid,
          errors: r.errors,
          preview: {
            customer_name: r.data["客戶姓名"],
            customer_phone: r.data["客戶電話"],
            pickup_address: r.data["取貨地址"],
            delivery_address: r.data["送貨地址"],
            cargo_description: r.data["貨物描述"],
            cargo_weight: r.data["重量(kg)"],
            required_vehicle_type: r.data["車型"],
            pickup_date: r.data["取貨日期"],
            delivery_date: r.data["送貨日期"],
            total_fee: r.data["費用(元)"],
            region: r.data["地區"],
          },
        })),
      });
    }

    // Actual insert (valid rows only)
    if (validRows.length === 0) {
      return res.status(400).json({ error: "沒有可匯入的有效資料", rows: rows.map(r => ({ rowNum: r.rowNum, errors: r.errors })) });
    }

    const inserted: number[] = [];
    const insertErrors: { rowNum: number; error: string }[] = [];

    for (const row of validRows) {
      try {
        const d = row.data;
        const fee = d["費用(元)"] ? Number(d["費用(元)"]) : null;

        // Detect auto-routing zone
        const routing = await applyAutoRoutingToOrder({
          pickup_address: d["取貨地址"],
          delivery_address: d["送貨地址"],
          required_vehicle_type: d["車型"] || null,
          cargo_description: d["貨物描述"] || null,
          region: d["地區"] || null,
          postal_code: d["郵遞區號"] || null,
        });

        const { rows: result } = await pool.query(
          `INSERT INTO orders (
            customer_name, customer_phone, pickup_address, delivery_address,
            cargo_description, cargo_weight, required_vehicle_type, cargo_quantity,
            pickup_date, pickup_time, delivery_date, delivery_time,
            pickup_contact_person, delivery_contact_person,
            pickup_contact_name, delivery_contact_name,
            need_tailgate, need_hydraulic_pallet, special_requirements,
            total_fee, base_price, notes, region, status,
            source, zone_id, team_id, created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$20,$21,$22,'pending','import',$23,$24,NOW(),NOW()
          ) RETURNING id`,
          [
            d["客戶姓名"], d["客戶電話"], d["取貨地址"], d["送貨地址"],
            d["貨物描述"] || null,
            d["重量(kg)"] ? Number(d["重量(kg)"]) : null,
            d["車型"] || null,
            d["數量"] || null,
            d["取貨日期"] || null, d["取貨時間"] || null,
            d["送貨日期"] || null, d["送貨時間"] || null,
            d["取貨聯絡人"] || null, d["送貨聯絡人"] || null,
            d["取貨聯絡電話"] || null, d["送貨聯絡電話"] || null,
            d["尾板"] === "是" ? "yes" : d["尾板"] === "否" ? "no" : null,
            d["液壓拖板車"] === "是" ? "yes" : null,
            d["特殊需求"] || null,
            fee,
            d["備註"] || null,
            d["地區"] || routing.region || null,
            routing.zone_id, routing.team_id,
          ]
        );
        inserted.push(result[0].id as number);
      } catch (e) {
        insertErrors.push({ rowNum: row.rowNum, error: String(e).slice(0, 200) });
      }
    }

    res.json({
      ok: true,
      inserted: inserted.length,
      inserted_ids: inserted,
      skipped_errors: errorRows.length,
      insert_errors: insertErrors,
      routing_applied: inserted.length > 0,
    });

  } catch (e) { res.status(500).json({ error: String(e) }); }
});
