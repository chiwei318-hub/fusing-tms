#!/usr/bin/env python3
"""
富詠全智慧物流清算平台 — Python SDK 範例
==========================================

使用方式：
    export REPLIT_LOGISTICS_BASE_URL="https://logistics-dispatch-management--chiwei318.replit.app"
    export REPLIT_LOGISTICS_API_KEY="fv1_xxxxxxxxxxxx"
    python3 examples/basic_usage.py

環境變數：
    REPLIT_LOGISTICS_BASE_URL  — 平台網址（結尾不加斜線）
    REPLIT_LOGISTICS_API_KEY   — Open API 金鑰（格式：fv1_xxx）
"""

import os, sys, json, textwrap
from urllib import request, error as urlerror

# ─── 設定 ─────────────────────────────────────────────────────────────────────

BASE_URL = os.environ.get("REPLIT_LOGISTICS_BASE_URL", "").rstrip("/")
API_KEY  = os.environ.get("REPLIT_LOGISTICS_API_KEY", "")

if not BASE_URL:
    sys.exit("❌  請設定 REPLIT_LOGISTICS_BASE_URL 環境變數")

# ─── 底層 HTTP 工具 ────────────────────────────────────────────────────────────

def _call(method: str, path: str, body: dict | None = None, *, auth: bool = False) -> dict:
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if auth:
        if not API_KEY:
            sys.exit("❌  請設定 REPLIT_LOGISTICS_API_KEY 環境變數（此端點需要 API Key）")
        headers["X-API-Key"] = API_KEY
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urlerror.HTTPError as e:
        body = json.loads(e.read()) if e.headers.get("Content-Type","").startswith("application/json") else {"raw": e.read().decode()}
        print(f"  ⚠  HTTP {e.code}: {body}")
        return {}

def get(path, *, auth=False):           return _call("GET",    path, auth=auth)
def post(path, body, *, auth=False):    return _call("POST",   path, body, auth=auth)

def divider(title=""):
    print("\n" + "─" * 60)
    if title: print(f"  {title}")
    print("─" * 60)

def pretty(d: dict):
    print(textwrap.indent(json.dumps(d, ensure_ascii=False, indent=2), "  "))


# ═══════════════════════════════════════════════════════════════════════════════
# 模組 1：廠商列表（不需 API Key）
# ═══════════════════════════════════════════════════════════════════════════════

divider("模組 1｜廠商資料查詢  GET /api/partners")

partners_resp = get("/api/partners")
partners = partners_resp.get("partners", [])

print(f"\n  共 {len(partners)} 家合作廠商：\n")
print(f"  {'ID':>3}  {'廠商名稱':<14} {'等級':<8} {'起步價':>6} {'公里費':>6} {'進倉費':>6} {'山區費':>6}")
print(f"  {'':->3}  {'':->14} {'':->8} {'':->6} {'':->6} {'':->6} {'':->6}")
for p in partners:
    print(f"  {p['id']:>3}  {p['name']:<14} {p.get('tier','?'):<8} "
          f"{p['base_price']:>6} {p['km_rate']:>6} "
          f"{p.get('park_fee','?'):>6} {p.get('mountain_fee','?'):>6}")

# 取第一家廠商 ID 供後續使用
PARTNER_ID = partners[0]["id"] if partners else 1


# ═══════════════════════════════════════════════════════════════════════════════
# 模組 2：車型矩陣（不需 API Key）
# ═══════════════════════════════════════════════════════════════════════════════

divider("模組 2｜車型矩陣  GET /api/vehicle-matrix/types")

types_resp = get("/api/vehicle-matrix/types")
types = types_resp.get("types", [])

print(f"\n  {'車型代碼':<10} {'名稱':<15} {'重量因子':>8}")
for t in types:
    print(f"  {t['type_code']:<10} {t['type_name']:<15} {float(t['weight_factor']):>8.2f}")

equip_resp = get("/api/vehicle-matrix/equipment")
equip = equip_resp.get("equipment", [])

print(f"\n  特殊設備：")
for e in equip:
    mul  = f"×{float(e['multiplier']):.1f}" if float(e['multiplier']) != 1 else "—"
    surch = f"+NT${int(float(e['surcharge']))}" if float(e['surcharge']) else "—"
    print(f"    {e['code']:<12} {e['name']:<6}  乘數:{mul:<5} 固定加成:{surch}")


# ═══════════════════════════════════════════════════════════════════════════════
# 模組 3：智慧報價引擎（不需 API Key）
# ═══════════════════════════════════════════════════════════════════════════════

divider("模組 3｜智慧報價  POST /api/smart-quote/calculate")

# 情境 A：台積電 × 17噸 × 進倉
print("\n  【情境 A】台積電物流部 × 17噸大貨車 × 進倉\n")
quote_a = post("/api/smart-quote/calculate", {
    "partner_id":    PARTNER_ID,           # 台積電物流部
    "pickup_address":  "台北市信義區松壽路12號",
    "delivery_address": "桃園市蘆竹區南崁物流中心",
    "vehicle_type":  "17t",
    "equipment":     [],
    "is_warehouse_in": True,
})
if quote_a.get("ok"):
    print(f"  距離       {quote_a['distance_km']} km  ({quote_a['distance_source']})")
    print(f"  基本費     NT$ {quote_a['base_price']:,}")
    print(f"  車型加成   NT$ {quote_a['vehicle_surcharge']:,}  (×{quote_a['breakdown']['vehicle']['weight_factor']})")
    zone_str = "、".join(f"{z['label']} +${z['flat']}" for z in quote_a['breakdown']['zones']) or "無"
    print(f"  區域加成   NT$ {quote_a['area_surcharge']:,}  ({zone_str})")
    print(f"  ──────────────────────────────")
    print(f"  廠商報價   NT$ {quote_a['total_quote']:,}")
    print(f"  平台抽成   NT$ {quote_a['platform_revenue']:,}  ({quote_a['breakdown']['partner']['profit_margin']}%)")
    print(f"  司機實領   NT$ {quote_a['driver_pay']:,}")

# 情境 B：冷凍設備 + 離島
print("\n  【情境 B】標準廠商 × 3.5噸 × 冷凍 × 離島（澎湖）\n")
quote_b = post("/api/smart-quote/calculate", {
    "pickup_address":  "高雄市左營區",
    "delivery_address": "澎湖縣馬公市",
    "vehicle_type":  "3.5t",
    "equipment":     ["frozen"],
})
if quote_b.get("ok"):
    equip_str = "、".join(f"{e['name']} ×{e['multiplier']}" for e in quote_b['breakdown']['equipment']) or "無"
    print(f"  距離       {quote_b['distance_km']} km")
    print(f"  設備加成   {equip_str}")
    zones_b = "、".join(f"{z['label']} +${z['flat']}" for z in quote_b['breakdown']['zones']) or "無"
    print(f"  區域加成   {zones_b}")
    print(f"  廠商報價   NT$ {quote_b['total_quote']:,}")
    print(f"  司機實領   NT$ {quote_b['driver_pay']:,}")


# ═══════════════════════════════════════════════════════════════════════════════
# 模組 4：AR/AP 月報（不需 API Key）
# ═══════════════════════════════════════════════════════════════════════════════

divider("模組 4｜財務月報  GET /api/financials/monthly-report")

report = get("/api/financials/monthly-report?period=2026-05")
if report.get("ok"):
    s = report.get("summary", {})
    print(f"\n  期間：{report.get('period')}")
    print(f"  訂單數：{s.get('total_orders',0)}")
    print(f"  應收（AR）：NT$ {s.get('total_ar',0):,}")
    print(f"  應付（AP）：NT$ {s.get('total_ap',0):,}")
    print(f"  淨利潤    ：NT$ {s.get('net_profit',0):,}")


# ═══════════════════════════════════════════════════════════════════════════════
# Open API（需 API Key）
# ═══════════════════════════════════════════════════════════════════════════════

if not API_KEY:
    divider()
    print("\n  ℹ  未設定 REPLIT_LOGISTICS_API_KEY，跳過 Open API 部分\n")
    sys.exit(0)

# ─── Open API 報價 ────────────────────────────────────────────────────────────

divider("Open API｜報價試算  POST /api/open/v1/quote  [需 API Key]")

open_quote = post("/api/open/v1/quote", {
    "vehicle_type": "3.5T",
    "distance_km":  25,
    "weight_kg":    500,
}, auth=True)
if open_quote:
    print(f"\n  車型       {open_quote.get('vehicle_type')}")
    print(f"  距離       {open_quote.get('distance_km')} km")
    print(f"  報價合計   NT$ {open_quote.get('total',0):,}")
    pretty(open_quote.get("breakdown", {}))


# ─── Open API 建立訂單 ────────────────────────────────────────────────────────

divider("Open API｜建立訂單  POST /api/open/v1/orders  [需 API Key]")

new_order = post("/api/open/v1/orders", {
    "customer_name":        "張小明",
    "customer_phone":       "0912-345-678",
    "customer_email":       "ming@example.com",
    "pickup_address":       "台北市信義區信義路五段7號",
    "delivery_address":     "新北市板橋區縣民大道一段100號",
    "pickup_date":          "2026-05-10",
    "pickup_time":          "10:00",
    "required_vehicle_type": "3.5T",
    "cargo_weight":         200,
    "cargo_description":    "電子設備零件（精密儀器）",
    "notes":                "需輕放，勿堆疊",
    "payment_method":       "monthly",
}, auth=True)

ORDER_ID = None
if new_order:
    ORDER_ID = new_order.get("id")
    print(f"\n  ✅ 訂單建立成功")
    print(f"  訂單 ID    {ORDER_ID}")
    print(f"  客戶       {new_order.get('customer_name')}")
    print(f"  取貨地     {new_order.get('pickup_address')}")
    print(f"  送貨地     {new_order.get('delivery_address')}")
    print(f"  狀態       {new_order.get('status')}")


# ─── Open API 查詢訂單 ────────────────────────────────────────────────────────

if ORDER_ID:
    divider(f"Open API｜查詢訂單  GET /api/open/v1/orders/{ORDER_ID}  [需 API Key]")
    fetched = get(f"/api/open/v1/orders/{ORDER_ID}", auth=True)
    if fetched:
        print(f"\n  訂單 ID    {fetched.get('id')}")
        print(f"  司機       {fetched.get('driver_name') or '（尚未派車）'}")
        print(f"  車牌       {fetched.get('license_plate') or '—'}")
        print(f"  狀態       {fetched.get('status')}")
        print(f"  建立時間   {fetched.get('created_at')}")

    divider(f"Open API｜物流追蹤  GET /api/open/v1/track/{ORDER_ID}  [需 API Key]")
    track = get(f"/api/open/v1/track/{ORDER_ID}", auth=True)
    if track:
        status_label = track.get("status_label", track.get("status"))
        print(f"\n  目前狀態   {status_label}")
        drv = track.get("driver")
        if drv:
            print(f"  配送司機   {drv.get('name')}  {drv.get('phone')}")
            loc = drv.get("location")
            if loc:
                print(f"  司機位置   lat={loc['lat']}  lng={loc['lng']}")
        else:
            print(f"  配送司機   （尚未指派）")


# ─── 列出所有 API 訂單 ────────────────────────────────────────────────────────

divider("Open API｜訂單列表  GET /api/open/v1/orders  [需 API Key]")

orders_resp = get("/api/open/v1/orders?limit=5", auth=True)
if orders_resp:
    rows = orders_resp.get("data", [])
    total = orders_resp.get("total", 0)
    print(f"\n  共 {total} 筆 API 訂單（顯示前 5 筆）\n")
    print(f"  {'ID':>5}  {'客戶名稱':<10} {'狀態':<10} {'建立時間'}")
    for o in rows:
        print(f"  {o['id']:>5}  {o['customer_name']:<10} {o['status']:<10} {o['created_at']}")


divider()
print("\n  ✅  範例執行完畢\n")
print(f"  平台網址：{BASE_URL}")
print(f"  管理後台：{BASE_URL}/logistics/admin")
print(f"  廠商報價：{BASE_URL}/logistics/quote/1")
print(f"  財務清算：{BASE_URL}/logistics/financials\n")
