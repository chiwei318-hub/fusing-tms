/**
 * ensureLocationTables.ts
 * 建立 location_history + customer_addresses 資料表，
 * 並從 orders / dispatch_order_routes / shopee_route_stops 匯入歷史地點
 */
import { pool } from "@workspace/db";

// ─── 建表 ──────────────────────────────────────────────────────────────────────
export async function ensureLocationTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS location_history (
      id                SERIAL PRIMARY KEY,
      address           TEXT NOT NULL,
      city              TEXT,
      district          TEXT,
      lat               NUMERIC(10,7),
      lng               NUMERIC(10,7),
      location_type     TEXT DEFAULT 'both',   -- pickup / delivery / both

      -- 使用統計
      visit_count       INTEGER NOT NULL DEFAULT 1,
      last_visited_at   TIMESTAMPTZ,
      first_visited_at  TIMESTAMPTZ,

      -- 關聯資料
      customer_ids      JSONB DEFAULT '[]'::jsonb,
      driver_ids        JSONB DEFAULT '[]'::jsonb,
      avg_duration_min  INTEGER,

      -- 商業資訊
      place_name        TEXT,
      place_type        TEXT,   -- warehouse/store/residence/office
      notes             TEXT,

      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT location_history_address_uq UNIQUE (address)
    );

    CREATE TABLE IF NOT EXISTS customer_addresses (
      id              SERIAL PRIMARY KEY,
      customer_id     INTEGER,
      customer_name   TEXT,
      address         TEXT NOT NULL,
      label           TEXT,        -- 「公司」「倉庫」「門市」
      use_count       INTEGER NOT NULL DEFAULT 1,
      last_used_at    TIMESTAMPTZ,
      is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT customer_addresses_uq UNIQUE (customer_id, address)
    );

    CREATE INDEX IF NOT EXISTS idx_loc_hist_address ON location_history USING GIN (to_tsvector('simple', address));
    CREATE INDEX IF NOT EXISTS idx_loc_hist_city ON location_history (city);
    CREATE INDEX IF NOT EXISTS idx_loc_hist_visit ON location_history (visit_count DESC);
    CREATE INDEX IF NOT EXISTS idx_cust_addr_cid ON customer_addresses (customer_id);
  `);
  console.log("[LocationHistory] tables ensured");
}

// ─── 匯入主函式 ─────────────────────────────────────────────────────────────────
export async function importLocationHistory(): Promise<{
  orders: number;
  dispatch: number;
  shopee: number;
  customers: number;
}> {
  // 冪等保護：如果已有資料，跳過（避免每次重啟疊加計數）
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS cnt FROM location_history`);
  if (Number(countRows[0].cnt) > 0) {
    console.log("[LocationHistory] 表已有資料，跳過初始匯入");
    return { orders: 0, dispatch: 0, shopee: 0, customers: 0 };
  }

  const result = { orders: 0, dispatch: 0, shopee: 0, customers: 0 };

  // ── 1. 從 orders 匯入取貨地址 ──────────────────────────────────────────
  const pickupRes = await pool.query(`
    INSERT INTO location_history
      (address, city, district, location_type,
       visit_count, last_visited_at, first_visited_at,
       customer_ids, driver_ids)
    SELECT
      pickup_address,
      NULLIF(pickup_city, ''),
      NULLIF(pickup_district, ''),
      'pickup',
      COUNT(*)::integer,
      MAX(created_at),
      MIN(created_at),
      jsonb_agg(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL),
      jsonb_agg(DISTINCT driver_id)   FILTER (WHERE driver_id IS NOT NULL)
    FROM orders
    WHERE pickup_address IS NOT NULL AND pickup_address <> ''
    GROUP BY pickup_address, pickup_city, pickup_district
    ON CONFLICT (address) DO UPDATE SET
      visit_count      = location_history.visit_count + EXCLUDED.visit_count,
      last_visited_at  = GREATEST(location_history.last_visited_at, EXCLUDED.last_visited_at),
      first_visited_at = LEAST(location_history.first_visited_at, EXCLUDED.first_visited_at),
      location_type    = CASE
        WHEN location_history.location_type = 'delivery' THEN 'both'
        ELSE location_history.location_type
      END,
      customer_ids = (
        SELECT jsonb_agg(DISTINCT x)
        FROM jsonb_array_elements(
          COALESCE(location_history.customer_ids, '[]'::jsonb) ||
          COALESCE(EXCLUDED.customer_ids, '[]'::jsonb)
        ) x WHERE x IS NOT NULL AND x != 'null'::jsonb
      ),
      driver_ids = (
        SELECT jsonb_agg(DISTINCT x)
        FROM jsonb_array_elements(
          COALESCE(location_history.driver_ids, '[]'::jsonb) ||
          COALESCE(EXCLUDED.driver_ids, '[]'::jsonb)
        ) x WHERE x IS NOT NULL AND x != 'null'::jsonb
      ),
      updated_at = NOW()
    RETURNING id
  `);
  result.orders += pickupRes.rowCount ?? 0;

  // ── 2. 從 orders 匯入送達地址 ──────────────────────────────────────────
  const deliveryRes = await pool.query(`
    INSERT INTO location_history
      (address, city, district, location_type,
       visit_count, last_visited_at, first_visited_at,
       customer_ids, driver_ids)
    SELECT
      delivery_address,
      NULLIF(delivery_city, ''),
      NULLIF(delivery_district, ''),
      'delivery',
      COUNT(*)::integer,
      MAX(created_at),
      MIN(created_at),
      jsonb_agg(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL),
      jsonb_agg(DISTINCT driver_id)   FILTER (WHERE driver_id IS NOT NULL)
    FROM orders
    WHERE delivery_address IS NOT NULL AND delivery_address <> ''
    GROUP BY delivery_address, delivery_city, delivery_district
    ON CONFLICT (address) DO UPDATE SET
      visit_count      = location_history.visit_count + EXCLUDED.visit_count,
      last_visited_at  = GREATEST(location_history.last_visited_at, EXCLUDED.last_visited_at),
      first_visited_at = LEAST(location_history.first_visited_at, EXCLUDED.first_visited_at),
      location_type    = CASE
        WHEN location_history.location_type = 'pickup' THEN 'both'
        ELSE location_history.location_type
      END,
      customer_ids = (
        SELECT jsonb_agg(DISTINCT x)
        FROM jsonb_array_elements(
          COALESCE(location_history.customer_ids, '[]'::jsonb) ||
          COALESCE(EXCLUDED.customer_ids, '[]'::jsonb)
        ) x WHERE x IS NOT NULL AND x != 'null'::jsonb
      ),
      driver_ids = (
        SELECT jsonb_agg(DISTINCT x)
        FROM jsonb_array_elements(
          COALESCE(location_history.driver_ids, '[]'::jsonb) ||
          COALESCE(EXCLUDED.driver_ids, '[]'::jsonb)
        ) x WHERE x IS NOT NULL AND x != 'null'::jsonb
      ),
      updated_at = NOW()
    RETURNING id
  `);
  result.orders += deliveryRes.rowCount ?? 0;

  // ── 3. 從 dispatch_order_routes 匯入（含 GPS 座標）─────────────────────
  const dispatchPickupRes = await pool.query(`
    INSERT INTO location_history
      (address, location_type, lat, lng,
       visit_count, last_visited_at, first_visited_at, driver_ids)
    SELECT
      pickup_address,
      'pickup',
      AVG(pickup_lat),
      AVG(pickup_lng),
      COUNT(*)::integer,
      MAX(assigned_at),
      MIN(assigned_at),
      jsonb_agg(DISTINCT assigned_driver_id::text::jsonb) FILTER (WHERE assigned_driver_id IS NOT NULL)
    FROM dispatch_order_routes
    WHERE pickup_address IS NOT NULL AND pickup_address <> ''
    GROUP BY pickup_address
    ON CONFLICT (address) DO UPDATE SET
      lat              = COALESCE(EXCLUDED.lat, location_history.lat),
      lng              = COALESCE(EXCLUDED.lng, location_history.lng),
      visit_count      = location_history.visit_count + EXCLUDED.visit_count,
      last_visited_at  = GREATEST(location_history.last_visited_at, EXCLUDED.last_visited_at),
      first_visited_at = LEAST(location_history.first_visited_at, EXCLUDED.first_visited_at),
      location_type    = CASE
        WHEN location_history.location_type = 'delivery' THEN 'both'
        ELSE location_history.location_type
      END,
      updated_at = NOW()
    RETURNING id
  `);
  result.dispatch += dispatchPickupRes.rowCount ?? 0;

  const dispatchDeliveryRes = await pool.query(`
    INSERT INTO location_history
      (address, location_type, lat, lng,
       visit_count, last_visited_at, first_visited_at, driver_ids)
    SELECT
      delivery_address,
      'delivery',
      AVG(delivery_lat),
      AVG(delivery_lng),
      COUNT(*)::integer,
      MAX(assigned_at),
      MIN(assigned_at),
      jsonb_agg(DISTINCT assigned_driver_id::text::jsonb) FILTER (WHERE assigned_driver_id IS NOT NULL)
    FROM dispatch_order_routes
    WHERE delivery_address IS NOT NULL AND delivery_address <> ''
    GROUP BY delivery_address
    ON CONFLICT (address) DO UPDATE SET
      lat              = COALESCE(EXCLUDED.lat, location_history.lat),
      lng              = COALESCE(EXCLUDED.lng, location_history.lng),
      visit_count      = location_history.visit_count + EXCLUDED.visit_count,
      last_visited_at  = GREATEST(location_history.last_visited_at, EXCLUDED.last_visited_at),
      first_visited_at = LEAST(location_history.first_visited_at, EXCLUDED.first_visited_at),
      location_type    = CASE
        WHEN location_history.location_type = 'pickup' THEN 'both'
        ELSE location_history.location_type
      END,
      updated_at = NOW()
    RETURNING id
  `);
  result.dispatch += dispatchDeliveryRes.rowCount ?? 0;

  // ── 4. 從蝦皮路線匯入（shopee_route_stops）─────────────────────────────
  const shopeeStopsRes = await pool.query(`
    INSERT INTO location_history
      (address, place_name, place_type, location_type,
       visit_count, first_visited_at, last_visited_at)
    SELECT
      store_address,
      store_name,
      'store',
      'delivery',
      COUNT(*)::integer,
      MIN(created_at),
      MAX(created_at)
    FROM shopee_route_stops
    WHERE store_address IS NOT NULL AND store_address <> ''
    GROUP BY store_address, store_name
    ON CONFLICT (address) DO UPDATE SET
      place_name       = COALESCE(EXCLUDED.place_name, location_history.place_name),
      place_type       = COALESCE(location_history.place_type, 'store'),
      visit_count      = location_history.visit_count + EXCLUDED.visit_count,
      last_visited_at  = GREATEST(location_history.last_visited_at, EXCLUDED.last_visited_at),
      location_type    = CASE
        WHEN location_history.location_type = 'pickup' THEN 'both'
        ELSE location_history.location_type
      END,
      updated_at = NOW()
    RETURNING id
  `);
  result.shopee += shopeeStopsRes.rowCount ?? 0;

  // shopee_week_route_stops
  const shopeeWeekRes = await pool.query(`
    INSERT INTO location_history
      (address, place_name, place_type, location_type,
       visit_count, first_visited_at, last_visited_at)
    SELECT
      store_address,
      store_name,
      'store',
      'delivery',
      COUNT(*)::integer,
      MIN(created_at),
      MAX(created_at)
    FROM shopee_week_route_stops
    WHERE store_address IS NOT NULL AND store_address <> ''
    GROUP BY store_address, store_name
    ON CONFLICT (address) DO UPDATE SET
      place_name       = COALESCE(EXCLUDED.place_name, location_history.place_name),
      place_type       = COALESCE(location_history.place_type, 'store'),
      visit_count      = location_history.visit_count + EXCLUDED.visit_count,
      last_visited_at  = GREATEST(location_history.last_visited_at, EXCLUDED.last_visited_at),
      location_type    = CASE
        WHEN location_history.location_type = 'pickup' THEN 'both'
        ELSE location_history.location_type
      END,
      updated_at = NOW()
    RETURNING id
  `);
  result.shopee += shopeeWeekRes.rowCount ?? 0;

  // ── 5. 建立 customer_addresses 表（從 orders 提取）────────────────────
  const custAddrRes = await pool.query(`
    INSERT INTO customer_addresses
      (customer_id, customer_name, address, label, use_count, last_used_at)
    SELECT DISTINCT ON (customer_id, addr)
      customer_id,
      customer_name,
      addr,
      label,
      cnt::integer,
      last_used
    FROM (
      SELECT
        customer_id,
        customer_name,
        pickup_address AS addr,
        '取貨地址' AS label,
        COUNT(*) AS cnt,
        MAX(created_at) AS last_used
      FROM orders
      WHERE customer_id IS NOT NULL
        AND pickup_address IS NOT NULL AND pickup_address <> ''
      GROUP BY customer_id, customer_name, pickup_address

      UNION ALL

      SELECT
        customer_id,
        customer_name,
        delivery_address AS addr,
        '送達地址' AS label,
        COUNT(*) AS cnt,
        MAX(created_at) AS last_used
      FROM orders
      WHERE customer_id IS NOT NULL
        AND delivery_address IS NOT NULL AND delivery_address <> ''
      GROUP BY customer_id, customer_name, delivery_address
    ) sub
    WHERE customer_id IS NOT NULL
    ON CONFLICT (customer_id, address) DO UPDATE SET
      use_count    = customer_addresses.use_count + EXCLUDED.use_count,
      last_used_at = GREATEST(customer_addresses.last_used_at, EXCLUDED.last_used_at)
    RETURNING id
  `);
  result.customers = custAddrRes.rowCount ?? 0;

  // ── 6. 從地址字串補填縣市（orders 無 pickup_city 欄位時）──────────────────
  await fixCitiesFromAddresses();

  console.log(
    `[LocationHistory] 匯入完成 — orders:${result.orders} dispatch:${result.dispatch} shopee:${result.shopee} customer_addresses:${result.customers}`,
  );
  return result;
}

// ─── 從地址字串自動提取縣市 ──────────────────────────────────────────────────────
const TW_CITIES = [
  "台北市","新北市","桃園市","台中市","台南市","高雄市",
  "基隆市","新竹市","嘉義市","新竹縣","苗栗縣","彰化縣",
  "南投縣","雲林縣","嘉義縣","屏東縣","宜蘭縣","花蓮縣",
  "台東縣","澎湖縣","金門縣","連江縣",
];

function extractCityFromAddress(addr: string): string | null {
  for (const city of TW_CITIES) {
    if (addr.includes(city)) return city;
  }
  return null;
}

async function fixCitiesFromAddresses(): Promise<void> {
  const cases = TW_CITIES.map(
    (city) => `WHEN address LIKE '%${city}%' THEN '${city}'`,
  ).join("\n    ");
  await pool.query(`
    UPDATE location_history SET
      city = CASE ${cases} ELSE city END,
      updated_at = NOW()
    WHERE (city IS NULL OR city = '') AND address <> ''
  `);
}

// ─── 同步觸發器（新訂單建立後自動更新）───────────────────────────────────────────
export async function syncOrderToLocationHistory(order: {
  pickupAddress?: string | null;
  pickupCity?: string | null;
  pickupDistrict?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  customerId?: number | null;
  driverId?: number | null;
}): Promise<void> {
  const { pickupAddress, pickupCity, pickupDistrict,
          deliveryAddress, deliveryCity, deliveryDistrict,
          customerId, driverId } = order;

  const upsertAddr = async (
    address: string,
    city: string | null | undefined,
    district: string | null | undefined,
    type: "pickup" | "delivery",
  ) => {
    if (!address.trim()) return;
    // Auto-extract city from address string if not provided
    const resolvedCity = city?.trim() || extractCityFromAddress(address);
    city = resolvedCity;
    const custJson  = customerId  ? `[${customerId}]` : "[]";
    const drvJson   = driverId    ? `[${driverId}]`   : "[]";
    await pool.query(`
      INSERT INTO location_history
        (address, city, district, location_type, visit_count,
         last_visited_at, first_visited_at, customer_ids, driver_ids)
      VALUES ($1, $2, $3, $4, 1, NOW(), NOW(), $5::jsonb, $6::jsonb)
      ON CONFLICT (address) DO UPDATE SET
        visit_count     = location_history.visit_count + 1,
        last_visited_at = NOW(),
        location_type   = CASE
          WHEN location_history.location_type <> $4 THEN 'both'
          ELSE location_history.location_type
        END,
        city            = COALESCE(EXCLUDED.city, location_history.city),
        district        = COALESCE(EXCLUDED.district, location_history.district),
        customer_ids    = CASE
          WHEN $5::jsonb = '[]'::jsonb THEN location_history.customer_ids
          ELSE (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(
            COALESCE(location_history.customer_ids,'[]'::jsonb) || $5::jsonb) x WHERE x IS NOT NULL AND x != 'null'::jsonb)
        END,
        driver_ids      = CASE
          WHEN $6::jsonb = '[]'::jsonb THEN location_history.driver_ids
          ELSE (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(
            COALESCE(location_history.driver_ids,'[]'::jsonb) || $6::jsonb) x WHERE x IS NOT NULL AND x != 'null'::jsonb)
        END,
        updated_at = NOW()
    `, [address, city ?? null, district ?? null, type, custJson, drvJson]);
  };

  const promises: Promise<void>[] = [];
  if (pickupAddress)   promises.push(upsertAddr(pickupAddress, pickupCity, pickupDistrict, "pickup"));
  if (deliveryAddress) promises.push(upsertAddr(deliveryAddress, deliveryCity, deliveryDistrict, "delivery"));

  // Update customer_addresses
  if (customerId) {
    if (pickupAddress) promises.push(pool.query(`
      INSERT INTO customer_addresses (customer_id, address, label, use_count, last_used_at)
      VALUES ($1, $2, '取貨地址', 1, NOW())
      ON CONFLICT (customer_id, address) DO UPDATE SET
        use_count    = customer_addresses.use_count + 1,
        last_used_at = NOW()
    `, [customerId, pickupAddress]).then(() => undefined));
    if (deliveryAddress) promises.push(pool.query(`
      INSERT INTO customer_addresses (customer_id, address, label, use_count, last_used_at)
      VALUES ($1, $2, '送達地址', 1, NOW())
      ON CONFLICT (customer_id, address) DO UPDATE SET
        use_count    = customer_addresses.use_count + 1,
        last_used_at = NOW()
    `, [customerId, deliveryAddress]).then(() => undefined));
  }

  await Promise.all(promises);
}
