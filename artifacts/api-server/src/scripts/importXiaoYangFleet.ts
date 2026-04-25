/**
 * importXiaoYangFleet.ts
 * 路徑：artifacts/api-server/src/scripts/importXiaoYangFleet.ts
 *
 * 完整匯入小楊車隊：
 *   1. 建立小楊車隊（fusingao_fleets）
 *   2. 匯入 9 位司機（drivers + shopee_drivers）
 *   3. 匯入 6 台車輛（fleet_vehicles）
 *   4. 驗車/保險到期警告
 *
 * 執行：pnpm exec tsx artifacts/api-server/src/scripts/importXiaoYangFleet.ts
 */

import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function rocToAd(roc: string | null): string | null {
  if (!roc) return null;
  const parts = roc.replace(/\//g, ".").split(".");
  if (parts.length < 3) return null;
  const [y, m, d] = parts;
  return `${parseInt(y) + 1911}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

const FLEET = {
  fleet_name:               "小楊車隊",
  contact_name:             "小楊",
  fleet_type:               "affiliated" as const,
  commission_rate:          15.00,
  fusingao_commission_rate: 7.00,
  monthly_affiliation_fee:  0,
  platform_fee_monthly:     0,
  has_tax_id:               false,
  username:                 "xiaoyang",
  password:                 "xiaoyang",
};

const DRIVERS = [
  { shopee_id:"14681", name:"江明翰", id_number:"N124184434",
    birthday:"1982-09-06", phone:"0935448144",
    address:"高雄市三民區本上里黃興路106號四樓", driver_type:"affiliated" },
  { shopee_id:"14774", name:"董曜瑱", id_number:"F131122948",
    birthday:"2000-05-27", phone:"0902222253",
    address:"桃園市平鎮區復旦里文化街286號四樓", driver_type:"affiliated" },
  { shopee_id:"15079", name:"邱建閎", id_number:"E125167869",
    birthday:"1997-12-19", phone:"0935663869",
    address:"高雄市三民區灣中里莊敬路256之2號六樓", driver_type:"affiliated" },
  { shopee_id:"15080", name:"鍾立威", id_number:"H124814791",
    birthday:"1996-04-10", phone:"0933788150",
    address:"桃園市龍潭區紅橋路36巷2號", driver_type:"affiliated" },
  { shopee_id:"15569", name:"徐政偉", id_number:"J12294993",
    birthday:"1985-08-29", phone:"0938421829",
    address:"桃園市平鎮區廣丘里廣豐街福壽十一巷1號", driver_type:"affiliated" },
  { shopee_id:"16323", name:"陳朝良", id_number:"H121624508",
    birthday:"1972-11-12", phone:"0935737770",
    address:"桃園市平鎮區高雙里高雙路227巷1弄6之1號", driver_type:"affiliated" },
  { shopee_id:"16916", name:"陳品寰", id_number:"H122034759",
    birthday:"1977-04-22", phone:"0922207024",
    address:"桃園市龜山區大同里大同路172巷2弄15號2樓", driver_type:"external" },
  { shopee_id:"16917", name:"范林尊", id_number:"F128088606",
    birthday:"1990-12-04", phone:"0921690747",
    address:"桃園市平鎮區平安里南平路143號十樓之1", driver_type:"external" },
  { shopee_id:"16918", name:"楊逸堂", id_number:"H124093710",
    birthday:"1991-08-07", phone:"0917195582",
    address:"桃園市新屋區清華里中山東路一段462巷10號2樓", driver_type:"external" },
];

const VEHICLES = [
  { plate:"KPD-1399", brand:"國瑞", model:"ZCVU05X1",
    load_kg:1450, ins:rocToAd("115.07.17"), insp:rocToAd("115.09.15"),
    external:false },
  { plate:"KPD-0650", brand:"國瑞", model:"XZU650L-TB3",
    load_kg:1410, ins:rocToAd("115.07.29"), insp:rocToAd("114.12.29"),
    external:false },
  { plate:"KPD-0659", brand:"國瑞", model:"XZU650L-MB3",
    load_kg:1300, ins:rocToAd("115.07.16"), insp:rocToAd("114.12.29"),
    external:false },
  { plate:"KPB-2012", brand:"國瑞", model:"XZU650L-AI",
    load_kg:1390, ins:rocToAd("115.11.18"), insp:rocToAd("115.11.15"),
    external:false },
  { plate:"KPD-5977", brand:"國瑞", model:"XZU605-22",
    load_kg:1230, ins:null, insp:rocToAd("115.06.27"),
    external:true, note:"汶泰物流" },
  { plate:"KPA-7338", brand:"ISUZU", model:"HLAI5-03",
    load_kg:1240, ins:null, insp:rocToAd("116.02.26"),
    external:false },
];

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  小楊車隊 完整匯入程式");
  console.log("═══════════════════════════════════════\n");

  // ── Step 1: 建立/更新小楊車隊 ────────────────────────────────
  console.log("📋 Step 1: 建立小楊車隊...");

  // fusingao_fleets 的 UNIQUE 在 username，不在 fleet_name
  const { rows: existing } = await pool.query(
    `SELECT id, fleet_name FROM fusingao_fleets WHERE fleet_name = $1 LIMIT 1`,
    [FLEET.fleet_name]
  );

  let fleetId: number;
  if (existing.length > 0) {
    fleetId = existing[0].id;
    await pool.query(`
      UPDATE fusingao_fleets SET
        fleet_type               = $1,
        commission_rate          = $2,
        fusingao_commission_rate = $3,
        monthly_affiliation_fee  = $4,
        platform_fee_monthly     = $5,
        has_tax_id               = $6,
        is_active                = true
      WHERE id = $7
    `, [
      FLEET.fleet_type, FLEET.commission_rate, FLEET.fusingao_commission_rate,
      FLEET.monthly_affiliation_fee, FLEET.platform_fee_monthly, FLEET.has_tax_id,
      fleetId,
    ]);
    console.log(`  🔄 已存在，更新 → ${FLEET.fleet_name} (ID: ${fleetId})\n`);
  } else {
    const { rows } = await pool.query(`
      INSERT INTO fusingao_fleets
        (fleet_name, contact_name, fleet_type, commission_rate,
         fusingao_commission_rate, monthly_affiliation_fee,
         platform_fee_monthly, has_tax_id, is_active,
         username, password)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)
      RETURNING id
    `, [
      FLEET.fleet_name, FLEET.contact_name, FLEET.fleet_type,
      FLEET.commission_rate, FLEET.fusingao_commission_rate,
      FLEET.monthly_affiliation_fee, FLEET.platform_fee_monthly,
      FLEET.has_tax_id, FLEET.username, FLEET.password,
    ]);
    fleetId = rows[0].id;
    console.log(`  ✅ 新建 ${FLEET.fleet_name} (ID: ${fleetId})\n`);
  }

  // ── Step 2: 匯入司機 ─────────────────────────────────────────
  // 注意：drivers.franchisee_id 指向 franchisees 表（非 fusingao_fleets）
  //       改用 fleet_group 文字欄位記錄車隊名稱
  console.log("👷 Step 2: 匯入司機...");
  let driverOk = 0, driverFail = 0;

  for (const d of DRIVERS) {
    try {
      // 以 shopee_worker_id 優先查重，其次 phone
      const { rows: existDrv } = await pool.query(
        `SELECT id FROM drivers WHERE shopee_worker_id = $1 LIMIT 1`,
        [d.shopee_id]
      );

      let driverId: number;
      if (existDrv.length > 0) {
        driverId = existDrv[0].id;
        await pool.query(`
          UPDATE drivers SET
            name             = $1,
            phone            = $2,
            driver_type      = $3,
            fleet_group      = $4,
            shopee_worker_id = $5,
            id_number        = $6,
            birthday         = $7,
            home_address     = $8,
            is_active        = true
          WHERE id = $9
        `, [d.name, d.phone, d.driver_type, FLEET.fleet_name,
            d.shopee_id, d.id_number, d.birthday, d.address, driverId]);
        console.log(`  🔄 ${d.name} 工號:${d.shopee_id} → 更新 ID:${driverId}`);
      } else {
        const { rows } = await pool.query(`
          INSERT INTO drivers
            (name, phone, vehicle_type, license_plate,
             driver_type, status, is_active,
             fleet_group, shopee_worker_id, id_number, birthday, home_address)
          VALUES ($1,$2,'小貨車','待填',$3,'available',true,$4,$5,$6,$7,$8)
          RETURNING id
        `, [d.name, d.phone, d.driver_type, FLEET.fleet_name,
            d.shopee_id, d.id_number, d.birthday, d.address]);
        driverId = rows[0].id;
        const tag = d.driver_type === "external" ? " 【外車】" : "";
        console.log(`  ✅ ${d.name}${tag} 工號:${d.shopee_id} → 新增 ID:${driverId}`);
      }
      driverOk++;

      // 同步 shopee_drivers
      await pool.query(`
        INSERT INTO shopee_drivers
          (shopee_id, name, phone, id_number, birthday,
           address, fleet_name, is_own_driver, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (shopee_id) DO UPDATE SET
          name       = EXCLUDED.name,
          phone      = EXCLUDED.phone,
          id_number  = EXCLUDED.id_number,
          birthday   = EXCLUDED.birthday,
          address    = EXCLUDED.address,
          fleet_name = EXCLUDED.fleet_name,
          notes      = EXCLUDED.notes
      `, [
        d.shopee_id, d.name, d.phone, d.id_number,
        d.birthday, d.address, FLEET.fleet_name,
        d.driver_type === "affiliated",
        d.driver_type === "external" ? "外車" : null,
      ]);

    } catch (e: any) {
      console.log(`  ❌ ${d.name} 失敗：${e.message}`);
      driverFail++;
    }
  }

  // ── Step 3: 匯入車輛 ─────────────────────────────────────────
  // fleet_vehicles 實際欄位：
  //   fleet_reg_id, plate, vehicle_type, brand_model,
  //   capacity_kg, inspection_expires, insurance_expires, status
  console.log(`\n🚛 Step 3: 匯入車輛...`);
  let vehicleOk = 0;
  const today = new Date();

  for (const v of VEHICLES) {
    try {
      await pool.query(`
        INSERT INTO fleet_vehicles
          (fleet_reg_id, plate, vehicle_type, brand_model,
           capacity_kg, inspection_expires, insurance_expires, status)
        VALUES ($1,$2,'小貨車',$3,$4,$5,$6,'active')
        ON CONFLICT DO NOTHING
      `, [
        fleetId,
        v.plate,
        `${v.brand} ${v.model}`,
        v.load_kg,
        v.insp,
        v.ins,
      ]);

      let status = "";
      if (v.insp && new Date(v.insp) < today) status = " 🔴 驗車逾期！";
      else if (v.ins && new Date(v.ins) < today) status = " 🔴 保險逾期！";
      console.log(`  ✅ ${v.plate} ${v.brand} ${v.model} ${v.load_kg/1000}T${status}`);
      vehicleOk++;
    } catch (e: any) {
      console.log(`  ❌ ${v.plate} 失敗：${e.message}`);
    }
  }

  // ── Step 4: 到期警告彙總 ────────────────────────────────────
  console.log(`\n⚠️  到期警告彙總：`);
  const soon = new Date(); soon.setDate(today.getDate() + 30);
  let warningCount = 0;

  for (const v of VEHICLES) {
    if (v.insp) {
      const d = new Date(v.insp);
      if (d < today) {
        console.log(`  🔴 ${v.plate} 驗車已逾期（${v.insp}）請立即處理！`);
        warningCount++;
      } else if (d < soon) {
        console.log(`  🟡 ${v.plate} 驗車即將到期（${v.insp}）`);
        warningCount++;
      }
    }
    if (v.ins) {
      const d = new Date(v.ins);
      if (d < today) {
        console.log(`  🔴 ${v.plate} 保險已逾期（${v.ins}）請立即處理！`);
        warningCount++;
      }
    }
  }
  if (warningCount === 0) console.log("  ✅ 全部正常");

  // ── 最終摘要 ────────────────────────────────────────────────
  console.log(`
═══════════════════════════════════════
  匯入完成摘要
═══════════════════════════════════════
  車隊：${FLEET.fleet_name}（ID: ${fleetId}）
  司機：成功 ${driverOk} 筆 / 失敗 ${driverFail} 筆
  車輛：成功 ${vehicleOk} 筆
  待處理警告：${warningCount} 項
═══════════════════════════════════════
  `);

  await pool.end();
}

main().catch(e => {
  console.error("❌ 匯入失敗：", e.message);
  process.exit(1);
});
