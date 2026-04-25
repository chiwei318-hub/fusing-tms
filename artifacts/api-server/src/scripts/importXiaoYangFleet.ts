/**
 * importXiaoYangFleet.ts
 * 路徑：artifacts/api-server/src/scripts/importXiaoYangFleet.ts
 *
 * 一次匯入小楊車隊：
 *   - 9 位司機（含外車標記）
 *   - 6 台車輛（含驗車/保險到期提醒）
 *   - 自動關聯 fusingao_fleets
 *   - 自動建立 shopee_drivers 對應
 *
 * 執行：npx ts-node artifacts/api-server/src/scripts/importXiaoYangFleet.ts
 */

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DRIVERS = [
  { shopee_id: "14681", name: "江明翰", id_number: "N124184434",
    birthday: "1982-09-06", phone: "0935448144", address: "高雄市三民區本上里黃興路106號四樓",
    driver_type: "affiliated" },
  { shopee_id: "14774", name: "董曜瑱", id_number: "F131122948",
    birthday: "2000-05-27", phone: "0902222253", address: "桃園市平鎮區復旦里文化街286號四樓",
    driver_type: "affiliated" },
  { shopee_id: "15079", name: "邱建閎", id_number: "E125167869",
    birthday: "1997-12-19", phone: "0935663869", address: "高雄市三民區灣中里莊敬路256之2號六樓",
    driver_type: "affiliated" },
  { shopee_id: "15080", name: "鍾立威", id_number: "H124814791",
    birthday: "1996-04-10", phone: "0933788150", address: "桃園市龍潭區紅橋路36巷2號",
    driver_type: "affiliated" },
  { shopee_id: "15569", name: "徐政偉", id_number: "J12294993",
    birthday: "1985-08-29", phone: "0938421829", address: "桃園市平鎮區廣丘里廣豐街福壽十一巷1號",
    driver_type: "affiliated" },
  { shopee_id: "16323", name: "陳朝良", id_number: "H121624508",
    birthday: "1972-11-12", phone: "0935737770", address: "桃園市平鎮區高雙里高雙路227巷1弄6之1號",
    driver_type: "affiliated" },
  { shopee_id: "16916", name: "陳品寰", id_number: "H122034759",
    birthday: "1977-04-22", phone: "0922207024", address: "桃園市龜山區大同里大同路172巷2弄15號2樓",
    driver_type: "external" },
  { shopee_id: "16917", name: "范林尊", id_number: "F128088606",
    birthday: "1990-12-04", phone: "0921690747", address: "桃園市平鎮區平安里南平路143號十樓之1",
    driver_type: "external" },
  { shopee_id: "16918", name: "楊逸堂", id_number: "H124093710",
    birthday: "1991-08-07", phone: "0917195582", address: "桃園市新屋區清華里中山東路一段462巷10號2樓",
    driver_type: "external" },
];

function rocToAd(rocDate: string | null): string | null {
  if (!rocDate) return null;
  const [y, m, d] = rocDate.split(".");
  if (!y || !m || !d) return null;
  return `${parseInt(y) + 1911}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

const VEHICLES = [
  { plate_no: "KPD-1399", brand: "國瑞", model: "ZCVU05X1",
    manufactured: "2023-06", max_load_t: 1.45, gross_weight_t: 5,
    insurance_expiry: rocToAd("115.07.17"), inspection_expiry: rocToAd("115.09.15"),
    color: "白藍橙黃", is_external: false },
  { plate_no: "KPD-0650", brand: "國瑞", model: "XZU650L-TB3",
    manufactured: "2022-11", max_load_t: 1.41, gross_weight_t: 5,
    insurance_expiry: rocToAd("115.07.29"), inspection_expiry: rocToAd("114.12.29"),
    color: "白藍橙黃", is_external: false },
  { plate_no: "KPD-0659", brand: "國瑞", model: "XZU650L-MB3",
    manufactured: "2022-10", max_load_t: 1.30, gross_weight_t: 5,
    insurance_expiry: rocToAd("115.07.16"), inspection_expiry: rocToAd("114.12.29"),
    color: "白藍橙黃", is_external: false },
  { plate_no: "KPB-2012", brand: "國瑞", model: "XZU650L-AI",
    manufactured: "2025-11", max_load_t: 1.39, gross_weight_t: 5,
    insurance_expiry: rocToAd("115.11.18"), inspection_expiry: rocToAd("115.11.15"),
    color: "白", is_external: false },
  { plate_no: "KPD-5977", brand: "國瑞", model: "XZU605-22",
    manufactured: "2023-05", max_load_t: 1.23, gross_weight_t: 5,
    insurance_expiry: null, inspection_expiry: rocToAd("115.06.27"),
    color: "白", is_external: true, note: "汶泰物流" },
  { plate_no: "KPA-7338", brand: "ISUZU", model: "HLAI5-03",
    manufactured: "2026-02", max_load_t: 1.24, gross_weight_t: 5,
    insurance_expiry: null, inspection_expiry: rocToAd("116.02.26"),
    color: "白", is_external: false },
];

async function main() {
  console.log("🚛 開始匯入小楊車隊資料...\n");

  // ── 1. 確認 fleet_vehicles 表結構 ────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fleet_vehicles (
      id                SERIAL PRIMARY KEY,
      fleet_id          INTEGER,
      fleet_name        TEXT,
      plate_no          TEXT UNIQUE NOT NULL,
      brand             TEXT,
      model             TEXT,
      manufactured      TEXT,
      max_load_kg       NUMERIC(8,2),
      gross_weight_kg   NUMERIC(8,2),
      insurance_expiry  DATE,
      inspection_expiry DATE,
      color             TEXT,
      is_external       BOOLEAN DEFAULT FALSE,
      is_active         BOOLEAN DEFAULT TRUE,
      note              TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 2. 確認 drivers 擴充欄位 ─────────────────────────────────
  const driverCols = [
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS shopee_worker_id TEXT`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS birthday DATE`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS home_address TEXT`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS fleet_group TEXT`,
  ];
  for (const sql of driverCols) {
    try { await pool.query(sql); } catch {}
  }

  // ── 3. 找小楊車隊 ID ──────────────────────────────────────────
  const { rows: fleetRows } = await pool.query(`
    SELECT id, fleet_name FROM fusingao_fleets
    WHERE fleet_name ILIKE '%小楊%' OR fleet_name ILIKE '%yang%'
    LIMIT 1
  `);
  const fleetId   = fleetRows[0]?.id   ?? null;
  const fleetName = fleetRows[0]?.fleet_name ?? "小楊車隊";
  console.log(`📋 車隊：${fleetName}（ID: ${fleetId ?? "未找到，設為 NULL"}）\n`);

  // ── 4. 匯入司機（以 shopee_worker_id 或 phone 判重） ─────────
  console.log("👷 匯入司機...");
  let driverCount = 0;
  for (const d of DRIVERS) {
    try {
      // 先查是否已存在（以 shopee_worker_id 優先，其次 phone）
      const { rows: existing } = await pool.query(
        `SELECT id FROM drivers WHERE shopee_worker_id = $1 OR phone = $2 LIMIT 1`,
        [d.shopee_id, d.phone]
      );

      let driverId: number;
      if (existing.length > 0) {
        driverId = existing[0].id;
        await pool.query(`
          UPDATE drivers SET
            shopee_worker_id = $1, id_number = $2, birthday = $3,
            home_address = $4, driver_type = $5, fleet_group = $6
          WHERE id = $7
        `, [d.shopee_id, d.id_number, d.birthday, d.address, d.driver_type, fleetName, driverId]);
        console.log(`  🔄 ${d.name}（工號:${d.shopee_id}）已存在，更新 → driver ID: ${driverId}`);
      } else {
        const { rows } = await pool.query(`
          INSERT INTO drivers
            (name, phone, shopee_worker_id, id_number, birthday,
             home_address, driver_type, fleet_group,
             status, vehicle_type, license_plate)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'available','小貨車','-')
          RETURNING id
        `, [d.name, d.phone, d.shopee_id, d.id_number, d.birthday,
            d.address, d.driver_type, fleetName]);
        driverId = rows[0].id;
        const tag = d.driver_type === "external" ? "（外車）" : "";
        console.log(`  ✅ ${d.name} ${tag}工號:${d.shopee_id} → driver ID: ${driverId}`);
        driverCount++;
      }

      // 同步 shopee_drivers（只寫有的欄位）
      await pool.query(`
        INSERT INTO shopee_drivers (shopee_id, name, phone, is_own_driver)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (shopee_id) DO UPDATE SET
          name  = EXCLUDED.name,
          phone = EXCLUDED.phone
      `, [d.shopee_id, d.name, d.phone, d.driver_type !== "external"]).catch(() => {});

    } catch (e: any) {
      console.log(`  ❌ ${d.name} 失敗：${e.message}`);
    }
  }

  // ── 5. 匯入車輛 ───────────────────────────────────────────────
  console.log("\n🚛 匯入車輛...");
  let vehicleCount = 0;
  for (const v of VEHICLES) {
    try {
      await pool.query(`
        INSERT INTO fleet_vehicles
          (fleet_id, fleet_name, plate_no, brand, model, manufactured,
           max_load_kg, gross_weight_kg, insurance_expiry, inspection_expiry,
           color, is_external, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (plate_no) DO UPDATE SET
          fleet_id          = EXCLUDED.fleet_id,
          fleet_name        = EXCLUDED.fleet_name,
          insurance_expiry  = EXCLUDED.insurance_expiry,
          inspection_expiry = EXCLUDED.inspection_expiry,
          note              = EXCLUDED.note
      `, [
        fleetId, fleetName, v.plate_no, v.brand, v.model, v.manufactured,
        v.max_load_t * 1000, v.gross_weight_t * 1000,
        v.insurance_expiry, v.inspection_expiry,
        v.color, v.is_external, (v as any).note ?? null,
      ]);

      const expired = v.inspection_expiry && new Date(v.inspection_expiry) < new Date()
        ? " ⚠️ 驗車逾期！" : "";
      console.log(`  ✅ ${v.plate_no} ${v.brand} ${v.model} ${v.max_load_t}T${expired}`);
      vehicleCount++;
    } catch (e: any) {
      console.log(`  ❌ ${v.plate_no} 失敗：${e.message}`);
    }
  }

  // ── 6. 到期警告 ───────────────────────────────────────────────
  console.log("\n⚠️  到期/即將到期警告：");
  const today = new Date();
  const soon  = new Date(); soon.setDate(today.getDate() + 30);
  let warned = false;

  for (const v of VEHICLES) {
    if (v.inspection_expiry) {
      const d = new Date(v.inspection_expiry);
      if (d < today)      { console.log(`  🔴 ${v.plate_no} 驗車已逾期（${v.inspection_expiry}）`); warned = true; }
      else if (d < soon)  { console.log(`  🟡 ${v.plate_no} 驗車即將到期（${v.inspection_expiry}）`); warned = true; }
    }
    if (v.insurance_expiry) {
      const d = new Date(v.insurance_expiry);
      if (d < today)      { console.log(`  🔴 ${v.plate_no} 保險已逾期（${v.insurance_expiry}）`); warned = true; }
      else if (d < soon)  { console.log(`  🟡 ${v.plate_no} 保險即將到期（${v.insurance_expiry}）`); warned = true; }
    }
  }
  if (!warned) console.log("  （無）");

  // ── 7. 結果摘要 ───────────────────────────────────────────────
  console.log(`\n✅ 匯入完成！`);
  console.log(`   新增司機：${driverCount} 筆`);
  console.log(`   車輛：${vehicleCount} 筆`);
  console.log(`   車隊：${fleetName}`);

  await pool.end();
}

main().catch(e => {
  console.error("❌ 匯入失敗：", e);
  process.exit(1);
});
