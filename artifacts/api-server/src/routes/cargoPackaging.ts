/**
 * cargoPackaging.ts — 台灣貨品包裝類型參考表 + 容器規格表
 *
 * GET  /api/cargo-packaging               列出全部（?category=xxx&q=搜尋關鍵字）
 * GET  /api/cargo-packaging/cats          取得所有分類
 * GET  /api/cargo-containers              容器規格列表（?type=箱|籃|桶|袋&q=關鍵字）
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const cargoPackagingRouter = Router();

// ── 種子資料 ───────────────────────────────────────────────────────────────
const SEED: { category: string; cargo_type: string; packaging_methods: string[] }[] = [
  // 1️⃣ 食品飲料類
  { category: "食品飲料類", cargo_type: "生鮮蔬果",  packaging_methods: ["塑膠籃","竹籃","保麗龍箱","透氣網袋","真空包裝"] },
  { category: "食品飲料類", cargo_type: "肉品/水產",  packaging_methods: ["真空包裝袋","保麗龍箱＋冰袋","冷凍紙箱"] },
  { category: "食品飲料類", cargo_type: "飲料/酒類",  packaging_methods: ["玻璃瓶箱裝","PET瓶紙箱","易拉罐紙箱","棧板打包","鐵籠"] },
  { category: "食品飲料類", cargo_type: "加工食品",   packaging_methods: ["小紙箱","禮盒（紙盒/木盒）","鋁箔袋","塑膠袋"] },
  // 2️⃣ 農產品/飼料
  { category: "農產品/飼料", cargo_type: "穀物米麥",  packaging_methods: ["麻布袋","編織袋","牛皮紙袋","噸袋（FIBC）"] },
  { category: "農產品/飼料", cargo_type: "飼料/化肥",  packaging_methods: ["20–40kg 編織袋","紙袋","棧板收縮膜"] },
  { category: "農產品/飼料", cargo_type: "花卉植栽",  packaging_methods: ["花籃","花箱","塑膠套","專用花架"] },
  // 3️⃣ 生活用品/日用品
  { category: "生活用品/日用品", cargo_type: "衛生紙/尿布",   packaging_methods: ["壓縮塑膠袋","大紙箱","外箱棧板"] },
  { category: "生活用品/日用品", cargo_type: "清潔用品",       packaging_methods: ["小紙箱","塑膠桶（5–20L）","補充包袋"] },
  { category: "生活用品/日用品", cargo_type: "寢具/家具",      packaging_methods: ["真空壓縮袋","大型紙箱","木箱","收縮膜包裝"] },
  // 4️⃣ 服飾/鞋類
  { category: "服飾/鞋類", cargo_type: "衣服",    packaging_methods: ["小紙箱","吊掛式紙箱","塑膠袋（OPP/PE袋）","物流袋"] },
  { category: "服飾/鞋類", cargo_type: "鞋子",    packaging_methods: ["鞋盒（紙盒）","外箱（12雙/箱）"] },
  { category: "服飾/鞋類", cargo_type: "皮件包包", packaging_methods: ["防塵袋","紙箱","緩衝氣泡袋"] },
  // 5️⃣ 3C/電器
  { category: "3C/電器", cargo_type: "手機/筆電/3C", packaging_methods: ["彩盒＋紙箱","泡棉保護","物流袋"] },
  { category: "3C/電器", cargo_type: "小家電",       packaging_methods: ["彩盒","外箱紙箱","棧板收縮膜"] },
  { category: "3C/電器", cargo_type: "大型家電",     packaging_methods: ["紙箱＋木架","發泡保護","收縮膜"] },
  // 6️⃣ 建材/工業品
  { category: "建材/工業品", cargo_type: "鋼材/管材", packaging_methods: ["捆裝（鐵帶/塑鋼帶）","木托","鐵架"] },
  { category: "建材/工業品", cargo_type: "木材/板材", packaging_methods: ["打帶捆裝","棧板堆疊","薄膜包裝"] },
  { category: "建材/工業品", cargo_type: "水泥/石材", packaging_methods: ["40kg 編織袋","棧板打帶","裸裝大板"] },
  { category: "建材/工業品", cargo_type: "五金零件",  packaging_methods: ["小紙箱","塑膠籃","鐵籃","桶裝"] },
  // 7️⃣ 化工/原料
  { category: "化工/原料", cargo_type: "液體化工品", packaging_methods: ["20L 塑膠桶","200L 鐵桶","IBC槽 (1000L)"] },
  { category: "化工/原料", cargo_type: "粉體原料",   packaging_methods: ["紙袋","編織袋","噸袋（FIBC）"] },
  { category: "化工/原料", cargo_type: "危險品",     packaging_methods: ["鋼瓶","鐵桶","專用防爆容器"] },
  // 8️⃣ 醫療/保健
  { category: "醫療/保健", cargo_type: "藥品",     packaging_methods: ["小紙箱","藥瓶（玻璃/塑膠）","鋁箔包裝","控溫箱"] },
  { category: "醫療/保健", cargo_type: "醫療耗材",  packaging_methods: ["小紙箱","真空袋","滅菌袋"] },
  { category: "醫療/保健", cargo_type: "保健食品",  packaging_methods: ["瓶罐（塑膠/玻璃）","鋁箔袋","小紙箱"] },
  // 9️⃣ 電商/零售
  { category: "電商/零售", cargo_type: "混合包裹",    packaging_methods: ["物流袋（黑/灰）","小紙箱","快遞袋","氣泡信封袋"] },
  { category: "電商/零售", cargo_type: "化妝品保養品", packaging_methods: ["彩盒","玻璃瓶","氣泡袋","外箱紙箱"] },
  { category: "電商/零售", cargo_type: "小型百貨",    packaging_methods: ["吊卡袋","塑膠袋","快遞紙箱"] },
  // 🔟 特殊貨
  { category: "特殊貨", cargo_type: "展覽/舞台器材",   packaging_methods: ["鐵籠","木箱","航空箱 (Flight Case)","收縮膜包裝"] },
  { category: "特殊貨", cargo_type: "機械設備",        packaging_methods: ["木箱","鐵架","收縮膜","棧板固定"] },
  { category: "特殊貨", cargo_type: "藝術品/精密儀器",  packaging_methods: ["木箱","保溫箱","懸吊防震包裝"] },
  { category: "特殊貨", cargo_type: "冷藏藥品/疫苗",   packaging_methods: ["保冷箱","溫控容器","乾冰箱"] },
];

// ── 容器規格種子資料 ───────────────────────────────────────────────────────
interface ContainerSeed {
  container_type: string;
  name_zh:        string;
  size_desc:      string;
  volume_m3:      number;
  common_use:     string;
}

const CONTAINER_SEED: ContainerSeed[] = [
  // 箱
  { container_type: "箱", name_zh: "小紙箱",         size_desc: "30×20×20 cm",             volume_m3: 0.012, common_use: "3C小家電、食品禮盒" },
  { container_type: "箱", name_zh: "中紙箱",         size_desc: "40×30×30 cm",             volume_m3: 0.036, common_use: "網購宅配標準箱" },
  { container_type: "箱", name_zh: "大紙箱",         size_desc: "60×40×40 cm",             volume_m3: 0.096, common_use: "家居用品、服飾批發" },
  { container_type: "箱", name_zh: "特大箱",         size_desc: "80×60×60 cm",             volume_m3: 0.288, common_use: "玩具、寢具、電器" },
  // 籃
  { container_type: "籃", name_zh: "蔬果籃（小）",   size_desc: "53×37×30 cm",             volume_m3: 0.059, common_use: "菜市場、通路進貨" },
  { container_type: "籃", name_zh: "蔬果籃（大）",   size_desc: "60×40×35 cm",             volume_m3: 0.084, common_use: "批發市場常見" },
  { container_type: "籃", name_zh: "塑膠物流籃",     size_desc: "65×45×32 cm",             volume_m3: 0.094, common_use: "便利商店、物流中心" },
  // 桶
  { container_type: "桶", name_zh: "小塑膠桶",       size_desc: "20L（直徑30×高35 cm）",   volume_m3: 0.025, common_use: "調味料、油品" },
  { container_type: "桶", name_zh: "中塑膠桶",       size_desc: "50L（直徑40×高50 cm）",   volume_m3: 0.063, common_use: "清潔用品" },
  { container_type: "桶", name_zh: "大藍桶",         size_desc: "100L（直徑50×高65 cm）",  volume_m3: 0.127, common_use: "工業原料" },
  { container_type: "桶", name_zh: "鐵桶",           size_desc: "200L（直徑58×高88 cm）",  volume_m3: 0.233, common_use: "化工、油品" },
  // 袋
  { container_type: "袋", name_zh: "穀物麻布袋",     size_desc: "50 kg（60×40×20 cm）",    volume_m3: 0.048, common_use: "白米、穀物" },
  { container_type: "袋", name_zh: "化肥/飼料編織袋", size_desc: "20–40 kg（70×50×15 cm）", volume_m3: 0.053, common_use: "農業、飼料" },
  { container_type: "袋", name_zh: "大型編織袋（噸袋 FIBC）", size_desc: "1,000 kg（100×100×100 cm）", volume_m3: 1.000, common_use: "大宗貨品、粉料" },
];

// ── 建立資料表 ─────────────────────────────────────────────────────────────
export async function ensureCargoPackagingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cargo_packaging (
      id                SERIAL PRIMARY KEY,
      category          TEXT     NOT NULL,
      cargo_type        TEXT     NOT NULL,
      packaging_methods TEXT[]   NOT NULL DEFAULT '{}',
      is_custom         BOOLEAN  NOT NULL DEFAULT false,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category, cargo_type)
    )
  `);

  // 僅在表格為空時種入預設資料
  const { rows } = await pool.query("SELECT COUNT(*) FROM cargo_packaging WHERE is_custom = false");
  if (Number(rows[0].count) === 0) {
    for (const row of SEED) {
      await pool.query(
        `INSERT INTO cargo_packaging (category, cargo_type, packaging_methods, is_custom)
         VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING`,
        [row.category, row.cargo_type, row.packaging_methods]
      );
    }
    console.log(`[CargoPackaging] 已種入 ${SEED.length} 筆包裝類型參考資料`);
  }

  // ── 容器規格表 ─────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cargo_containers (
      id              SERIAL PRIMARY KEY,
      container_type  TEXT           NOT NULL,
      name_zh         TEXT           NOT NULL,
      size_desc       TEXT           NOT NULL,
      volume_m3       NUMERIC(10,3)  NOT NULL,
      common_use      TEXT           NOT NULL,
      is_custom       BOOLEAN        NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      UNIQUE (name_zh)
    )
  `);

  const { rows: cntRows } = await pool.query("SELECT COUNT(*) FROM cargo_containers WHERE is_custom = false");
  if (Number(cntRows[0].count) === 0) {
    for (const c of CONTAINER_SEED) {
      await pool.query(
        `INSERT INTO cargo_containers (container_type, name_zh, size_desc, volume_m3, common_use, is_custom)
         VALUES ($1, $2, $3, $4, $5, false) ON CONFLICT DO NOTHING`,
        [c.container_type, c.name_zh, c.size_desc, c.volume_m3, c.common_use]
      );
    }
    console.log(`[CargoContainers] 已種入 ${CONTAINER_SEED.length} 筆容器規格資料`);
  }
}

// ── GET /api/cargo-containers ─────────────────────────────────────────────
cargoPackagingRouter.get("/cargo-containers", async (req, res) => {
  const { type, q } = req.query as Record<string, string>;
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (type && type !== "全部") {
    conds.push(`container_type = $${vals.length + 1}`); vals.push(type);
  }
  if (q) {
    conds.push(`(name_zh ILIKE $${vals.length + 1} OR common_use ILIKE $${vals.length + 1} OR size_desc ILIKE $${vals.length + 1})`);
    vals.push(`%${q}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM cargo_containers ${where} ORDER BY container_type, volume_m3`,
    vals
  );
  res.json({ ok: true, containers: rows });
});

// ── GET /api/cargo-packaging/cats ──────────────────────────────────────────
cargoPackagingRouter.get("/cargo-packaging/cats", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT DISTINCT category FROM cargo_packaging ORDER BY category"
  );
  res.json({ ok: true, categories: rows.map(r => r.category) });
});

// ── GET /api/cargo-packaging ───────────────────────────────────────────────
cargoPackagingRouter.get("/cargo-packaging", async (req, res) => {
  const { category, q } = req.query as Record<string, string>;
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (category && category !== "全部") {
    conds.push(`category = $${vals.length + 1}`); vals.push(category);
  }
  if (q) {
    conds.push(`(cargo_type ILIKE $${vals.length + 1} OR EXISTS (
      SELECT 1 FROM unnest(packaging_methods) pm WHERE pm ILIKE $${vals.length + 1}
    ))`);
    vals.push(`%${q}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM cargo_packaging ${where} ORDER BY category, cargo_type`,
    vals
  );
  res.json({ ok: true, items: rows });
});
