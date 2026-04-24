import streamlit as st
import datetime
import math

st.set_page_config(page_title="富詠運輸系統", layout="wide")

TRUCK_TYPES = {
    #  fuel_eff = km/L,  wear_cost = 維修保養元/km,  depreRate = 每km折舊元,  wage_base = 日薪
    "1.75噸(小發財)":    {"fuel_eff": 10.0, "wear_cost": 2.0,  "depreRate": 3.00,  "wage_base": 800},
    "3.5噸(堅達)":       {"fuel_eff": 7.0,  "wear_cost": 3.5,  "depreRate": 4.80,  "wage_base": 1200},
    "11噸(大貨車)":      {"fuel_eff": 4.5,  "wear_cost": 6.0,  "depreRate": 6.75,  "wage_base": 2000},
    "26噸(聯結車/鷗翼)": {"fuel_eff": 2.8,  "wear_cost": 10.0, "depreRate": 11.25, "wage_base": 3000},
}

REGIONS = ["基隆市", "台北市", "新北市", "桃園市", "新竹縣市", "苗栗縣",
           "台中市", "彰化縣", "雲林縣", "嘉義縣市", "台南市", "高雄市",
           "屏東縣", "宜蘭縣", "花蓮縣", "台東縣"]

BASE_FARE = {
    "3.5噸(一般貨物/堅達)": 2500,
    "11噸(中型貨車)":       4500,
    "26噸(大型/鷗翼)":      8000,
    "冷鏈低溫車(3.5噸)":    3500,
}

# ── 車型附加費設定（對應 vehicleSurcharge.ts）──────────────────────────
VEHICLE_CLASSES = {
    "CLASS_A": {"label": "小型貨車（3.5噸）",  "multiplier": 1.0},
    "CLASS_B": {"label": "中型貨車（8.5噸）",  "multiplier": 1.6},
    "CLASS_C": {"label": "大型貨車（17噸）",   "multiplier": 2.8},
    "CLASS_D": {"label": "聯結車（35噸）",      "multiplier": 4.2},
}

ADDON_OPTIONS = {
    "tailgate":     {"label": "🔧 升降尾門",    "type": "fixed",      "value": 500},
    "refrigerated": {"label": "❄️ 冷凍加成",    "type": "multiplier", "value": 1.5},
    "gullwing":     {"label": "🚛 鷗翼車廂",    "type": "fixed",      "value": 300},
    "crane":        {"label": "🏗️ 吊掛設備",    "type": "fixed",      "value": 800},
    "helper":       {"label": "👷 助手隨車",    "type": "fixed",      "value": 600},
    "night":        {"label": "🌙 夜間/假日",   "type": "fixed",      "value": 500},
    "remote":       {"label": "🏔️ 偏遠山區",    "type": "fixed",      "value": 400},
}

def calculate_vehicle_surcharge(base_price, vehicle_class, selected_addons):
    """對應後端 TypeScript vehicleSurcharge.ts 的計算邏輯"""
    multiplier = VEHICLE_CLASSES[vehicle_class]["multiplier"]
    adjusted = base_price * multiplier
    breakdown = []
    equipment_fee = 0

    for key in selected_addons:
        cfg = ADDON_OPTIONS[key]
        if cfg["type"] == "multiplier":
            before = adjusted
            adjusted *= cfg["value"]
            amount = round(adjusted - before)
            breakdown.append({"label": cfg["label"], "amount": amount, "type": "multiplier"})
        else:
            equipment_fee += cfg["value"]
            breakdown.append({"label": cfg["label"], "amount": cfg["value"], "type": "fixed"})

    final = math.ceil(adjusted + equipment_fee)
    return adjusted, equipment_fee, breakdown, final

# ══════════════════════════════════════════════════════════════
st.title("🚛 富詠運輸管理平台")
st.markdown("---")

tab_boss, tab_customer, tab_surcharge, tab_profit = st.tabs([
    "📊 老闆決策引擎",
    "🌐 客戶自助報價",
    "🚚 車型附加費試算",
    "📐 精準淨利計算",
])

# ═══════════════════════════════════════════════════════════
# TAB 1：老闆決策引擎
# ═══════════════════════════════════════════════════════════
with tab_boss:
    st.subheader("📞 客戶詢價即時試算")
    col1, col2, col3 = st.columns(3)

    with col1:
        customer_name = st.text_input("客戶名稱", "臨時詢價")
        cargo_type = st.selectbox("貨品類型", ["一般雜貨", "冷鏈低溫", "電子高價", "大型機具"])
        truck_choice = st.selectbox("預計派遣車型", list(TRUCK_TYPES.keys()))

    with col2:
        distance = st.number_input("預估總里程 (去程+回程 km)", value=200.0)
        quoted_price = st.number_input("客戶出價 (元)", value=8000)
        wait_time = st.number_input("預估待裝/卸貨時間 (小時)", value=1.0)

    with col3:
        fuel_price = st.number_input("今日油價", value=28.5)
        has_backload = st.checkbox("是否有回頭貨？ (可分擔 50% 回程成本)")

    truck_cfg = TRUCK_TYPES[truck_choice]
    fuel_cost        = (distance / truck_cfg["fuel_eff"]) * fuel_price
    maintenance_cost = distance * truck_cfg["wear_cost"]
    time_wage        = (wait_time * 200) + truck_cfg["wage_base"]

    if has_backload:
        actual_cost = (fuel_cost * 0.7) + maintenance_cost + time_wage
    else:
        actual_cost = fuel_cost + maintenance_cost + time_wage

    extra_event = st.multiselect("特殊事件附加", ["台北市區(塞車/禁行)", "偏遠山區", "夜間/假日", "需助手"])
    event_fee  = len(extra_event) * 500
    final_cost = actual_cost + event_fee

    profit = quoted_price - final_cost
    margin = (profit / quoted_price) * 100 if quoted_price > 0 else 0

    st.markdown("---")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("總預估成本", f"{int(final_cost):,} 元")
    c2.metric("預估淨利",   f"{int(profit):,} 元", f"{margin:.1f}%")

    if profit > 1500 and margin > 20:
        c3.success("🟢 建議接單：利潤優厚")
    elif profit > 0:
        c3.warning("🟡 勉強接單：利潤微薄")
    else:
        c3.error("🔴 絕對拒接：這單必虧")

    c4.write(
        f"**成本細項：**\n"
        f"- 油資: {int(fuel_cost):,}\n"
        f"- 折舊保養: {int(maintenance_cost):,}\n"
        f"- 人工/時間: {int(time_wage):,}\n"
        f"- 事件附加: {event_fee:,}"
    )

    st.markdown("---")
    st.caption("錢要放在會動的車上，命要握在系統的決策裡。 —— 富詠運輸")

# ═══════════════════════════════════════════════════════════
# TAB 2：客戶自助報價
# ═══════════════════════════════════════════════════════════
with tab_customer:
    st.subheader("📍 第一步：填寫運送資訊")
    col1, col2 = st.columns(2)

    with col1:
        origin      = st.selectbox("起運地點", REGIONS, key="cust_origin")
        destination = st.selectbox("抵達地點", ["台北市"] + [r for r in REGIONS if r != "台北市"], key="cust_dest")

    with col2:
        cust_truck    = st.selectbox("所需車型", list(BASE_FARE.keys()))
        shipment_date = st.date_input("預計出貨日期", datetime.date.today() + datetime.timedelta(days=1))

    region_dist    = 1.0 if origin == destination else 2.5
    total_estimate = BASE_FARE[cust_truck] * region_dist

    st.markdown("---")
    st.subheader("💰 系統即時估價")
    st.info(f"根據您的選擇：從 **{origin}** 到 **{destination}**")
    st.markdown(
        f"<h2 style='text-align:center;color:#1E88E5;'>預估運費：NT$ {int(total_estimate):,} 起</h2>",
        unsafe_allow_html=True,
    )
    st.caption("*註：此為系統預估價，實際報價以專員回覆為準。特殊時段或偏遠地區另計。")

    st.markdown("---")
    st.subheader("📞 我要預約／聯繫專員")
    with st.form("customer_order"):
        c1, c2 = st.columns(2)
        with c1:
            cust_name  = st.text_input("聯絡人姓名*")
            cust_phone = st.text_input("聯絡電話*")
        with c2:
            cust_email = st.text_input("Email（選填）")
            notes      = st.text_area("備註（如：需助手、特殊上下貨條件）")

        submit_button = st.form_submit_button("提交預約申請")

    if submit_button:
        if cust_name and cust_phone:
            st.success("✅ 申請已送出！富詠專員將於 30 分鐘內與您聯繫。")
        else:
            st.error("❌ 請填寫聯絡人姓名與電話。")

    st.markdown("---")
    st.caption("富詠運輸：穩定獲利、專業可靠、自動化管理。")

# ═══════════════════════════════════════════════════════════
# TAB 3：車型附加費試算
# ═══════════════════════════════════════════════════════════
with tab_surcharge:
    st.subheader("🚚 車型附加費精算器")
    st.markdown("根據車型載重權重與設備加成，精準計算每筆訂單的最終報價。")

    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.markdown("#### 📋 基本設定")
        base_price = st.number_input(
            "基礎運費（元）",
            min_value=100, max_value=500000, value=2500, step=100,
            help="尚未套用車型加權的底價，通常為 3.5 噸基準價"
        )

        vehicle_class_key = st.selectbox(
            "車型分級",
            options=list(VEHICLE_CLASSES.keys()),
            format_func=lambda k: VEHICLE_CLASSES[k]["label"],
        )
        vc = VEHICLE_CLASSES[vehicle_class_key]
        st.info(f"📐 車型加權倍率：**×{vc['multiplier']}**　→　加權後底價 = **NT$ {int(base_price * vc['multiplier']):,}**")

        st.markdown("#### ⚙️ 設備 & 情境附加")
        selected_addons = []
        for key, cfg in ADDON_OPTIONS.items():
            val_str = "（×1.5 倍乘）" if cfg["type"] == "multiplier" else f"（+NT$ {cfg['value']:,}）"
            checked = st.checkbox(
                f"{cfg['label']}　{val_str}",
                key=f"addon_{key}"
            )
            if checked:
                selected_addons.append(key)

    with col_right:
        st.markdown("#### 💰 試算結果")

        adjusted_price, equipment_fee, breakdown, final_price = calculate_vehicle_surcharge(
            base_price, vehicle_class_key, selected_addons
        )

        # 金額大字顯示
        st.markdown(
            f"<div style='background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;"
            f"padding:20px;text-align:center;margin-bottom:16px;'>"
            f"<p style='margin:0;color:#15803d;font-size:14px;font-weight:600;'>最終報價（含所有附加費）</p>"
            f"<h1 style='margin:8px 0 0;color:#15803d;font-size:42px;'>"
            f"NT$ {final_price:,}"
            f"</h1></div>",
            unsafe_allow_html=True
        )

        # 明細拆解
        st.markdown("**📊 計算明細**")
        weighted_base = int(base_price * vc["multiplier"])
        weight_diff   = weighted_base - base_price
        detail_data = {
            "項目": ["基礎運費", f"車型加權（×{vc['multiplier']}）"],
            "金額（元）": [f"NT$ {base_price:,}", f"+NT$ {weight_diff:,} → NT$ {weighted_base:,}"],
            "說明": ["底價", vc["label"]],
        }
        for item in breakdown:
            detail_data["項目"].append(item["label"])
            detail_data["金額（元）"].append(f"NT$ {item['amount']:,}")
            detail_data["說明"].append("倍乘加成" if item["type"] == "multiplier" else "固定附加費")

        detail_data["項目"].append("**最終報價**")
        detail_data["金額（元）"].append(f"**NT$ {final_price:,}**")
        detail_data["說明"].append("含全部附加費")

        st.table(detail_data)

        # 利潤試算延伸
        st.markdown("---")
        st.markdown("#### 📈 利潤快速試算")
        quoted = st.number_input("客戶出價（元）", min_value=0, value=final_price + 500, step=100, key="surcharge_quote")
        if quoted > 0:
            profit_s = quoted - final_price
            margin_s = (profit_s / quoted * 100) if quoted > 0 else 0
            col_a, col_b = st.columns(2)
            col_a.metric("預估毛利", f"NT$ {profit_s:,}", f"{margin_s:.1f}%")
            if profit_s > 1500 and margin_s > 20:
                col_b.success("🟢 建議接單")
            elif profit_s > 0:
                col_b.warning("🟡 勉強接單")
            else:
                col_b.error("🔴 必虧，拒接")

    st.markdown("---")
    st.markdown(
        "**車型加權說明**：CLASS_A（3.5噸）×1.0 → CLASS_B（8.5噸）×1.6 → CLASS_C（17噸）×2.8 → CLASS_D（35噸）×4.2\n\n"
        "冷凍加成為乘法疊加（加權後再乘以 1.5），其餘設備費為固定金額直接相加。"
    )
    st.caption("此計算邏輯與後端 API `/api/vehicle-surcharge/calculate` 完全同步。")

# ═══════════════════════════════════════════════════════════
# TAB 4：精準淨利計算引擎
# ═══════════════════════════════════════════════════════════
with tab_profit:
    st.subheader("📐 精準淨利計算引擎")
    st.markdown(
        "> **核心公式**：`Total Cost = (油費單價 × 距離 ÷ 油耗效率)` + `(每公里折舊維修費 × 距離)` + `司機工資`\n\n"
        "報價不能只看里程——變動成本（油耗、維修）與固定成本（折舊、保險、牌照稅）都必須量化進去。"
    )

    # ── 計算模式切換 ─────────────────────────────────────────────────────────
    calc_mode = st.radio(
        "計算模式",
        ["📅 月攤提法（完整財務模型）", "🏎️ 每公里費率法（快速精算）"],
        horizontal=True, key="p_mode",
        help="月攤提法：依車輛購置成本、折舊年限、保費精算。每公里費率法：用 depreRate 直接乘里程，適合快速報價。"
    )
    use_per_km = calc_mode.startswith("🏎️")

    # ── 第一區：車型 & 里程 & 油價 ─────────────────────────────────────────
    st.markdown("#### 🚛 基本行程設定")
    bc1, bc2, bc3 = st.columns(3)
    with bc1:
        p_truck    = st.selectbox("派遣車型", list(TRUCK_TYPES.keys()), key="p_truck")
    with bc2:
        p_distance = st.number_input("總里程（km，去程+回程）", value=150.0, min_value=1.0, step=5.0, key="p_dist")
    with bc3:
        p_fuel     = st.number_input("今日油價（元/升）", value=28.5, min_value=10.0, step=0.5, key="p_fuel")

    tcfg = TRUCK_TYPES[p_truck]

    # ── 第二區：固定成本設定（依模式分流） ──────────────────────────────────
    st.markdown("---")

    FIXED_DEFAULTS = {
        "1.75噸(小發財)":    {"vp": 800_000,   "dep": 8,  "ins": 30_000,  "lic": 6_000,  "trips": 25},
        "3.5噸(堅達)":       {"vp": 1_500_000, "dep": 8,  "ins": 50_000,  "lic": 12_000, "trips": 20},
        "11噸(大貨車)":      {"vp": 3_000_000, "dep": 10, "ins": 90_000,  "lic": 30_000, "trips": 15},
        "26噸(聯結車/鷗翼)": {"vp": 5_000_000, "dep": 10, "ins": 150_000, "lic": 60_000, "trips": 12},
    }
    fd = FIXED_DEFAULTS[p_truck]

    if use_per_km:
        # ── 模式 B：每公里費率法 ─────────────────────────────────────────────
        st.markdown("#### 🏎️ 每公里費率設定")
        st.caption("直接以元/km 計算，公式：`variableCost = distance × fuelPrice ÷ mpg`  `depreciation = distance × depreRate`")
        km1, km2, km3 = st.columns(3)
        with km1:
            p_maint_rate = st.number_input(
                "維修保養費率（元/km）", value=float(tcfg["wear_cost"]), step=0.5, key="p_mrate",
                help="maintRate：每公里維修保養緩衝費")
        with km2:
            p_depre_rate = st.number_input(
                "每公里折舊率（元/km）", value=float(tcfg["depreRate"]), step=0.25, key="p_drate",
                help="depreRate：依車輛殘值與年公里數推算，系統預設已填入")
        with km3:
            st.info(
                f"📐 **{p_truck} 車型預設**\n\n"
                f"- 油耗：{tcfg['fuel_eff']} km/L\n"
                f"- 維修：{tcfg['wear_cost']} 元/km\n"
                f"- 折舊：{tcfg['depreRate']} 元/km"
            )
        # 讓月攤提法的變數有安全預設值
        vehicle_price = fd["vp"]; dep_years = fd["dep"]; residual_pct = 0.10
        annual_ins = fd["ins"]; annual_lic = fd["lic"]
        monthly_trips = fd["trips"]; monthly_other = 0
    else:
        # ── 模式 A：月攤提法 ─────────────────────────────────────────────────
        st.markdown("#### 🏢 固定成本設定（每月攤提至每趟）")
        st.caption("折舊、保險、牌照稅為月固定支出，依本月趟次均攤至每一趟。")
        fc1, fc2, fc3 = st.columns(3)
        with fc1:
            vehicle_price  = st.number_input("車輛取得成本（元）",   value=fd["vp"],  step=100_000, key="p_vp")
            dep_years      = st.number_input("折舊年限（年）",        value=fd["dep"], min_value=1,  max_value=20, key="p_dy")
            residual_pct   = st.slider("殘值比例（%）", 0, 40, 10, key="p_res") / 100
        with fc2:
            annual_ins     = st.number_input("年保險費（元）",        value=fd["ins"], step=5_000, key="p_ins")
            annual_lic     = st.number_input("年牌照稅/燃料稅（元）", value=fd["lic"], step=1_000, key="p_lic")
        with fc3:
            monthly_trips  = st.number_input("本月預估趟次",          value=fd["trips"], min_value=1, max_value=200, key="p_trips")
            monthly_other  = st.number_input("其他月固定費用（元）",  value=0, step=500, key="p_other",
                                              help="如停車費、管理費等月固定支出")
        # 讓每公里法的變數有安全預設值
        p_maint_rate = tcfg["wear_cost"]
        p_depre_rate = tcfg["depreRate"]

    # ── 第三區：人工成本 ─────────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("#### 👷 人工成本")
    lc1, lc2, lc3 = st.columns(3)
    with lc1:
        driver_daily   = st.number_input("司機日薪（元）",        value=tcfg["wage_base"], step=100, key="p_wage")
    with lc2:
        wait_hours     = st.number_input("等候時間（小時）",      value=1.5, min_value=0.0, step=0.5, key="p_wait")
    with lc3:
        wait_rate      = st.number_input("等候費率（元/小時）",   value=200, step=50, key="p_wrate")

    # ══════════════════════════════════════════════════
    # 核心公式計算（依模式分流）
    # ══════════════════════════════════════════════════

    # 1. 油費（兩種模式相同）
    fuel_cost_p = (p_fuel * p_distance) / tcfg["fuel_eff"]   # variableCost = distance × fuelPrice / mpg

    if use_per_km:
        # ── 模式 B：每公里費率法（忠實移植 calculateNetProfit） ─────────────
        maintenance_buffer = p_distance * p_maint_rate        # maintenanceBuffer = distance × maintRate
        depreciation_km    = p_distance * p_depre_rate        # depreciation      = distance × depreRate
        variable_total     = fuel_cost_p + maintenance_buffer
        fixed_per_trip     = depreciation_km                  # 折舊即固定欄位（每km法）
        wear_cost_p        = maintenance_buffer               # 對齊顯示變數
        monthly_dep = monthly_ins_m = monthly_lic_m = 0      # 月攤提在此模式為 0
    else:
        # ── 模式 A：月攤提法（完整財務模型） ─────────────────────────────────
        wear_cost_p    = tcfg["wear_cost"] * p_distance
        variable_total = fuel_cost_p + wear_cost_p
        depreciable    = vehicle_price * (1 - residual_pct)
        monthly_dep    = depreciable / (dep_years * 12)
        monthly_ins_m  = annual_ins / 12
        monthly_lic_m  = annual_lic / 12
        fixed_per_trip = (monthly_dep + monthly_ins_m + monthly_lic_m + monthly_other) / monthly_trips
        maintenance_buffer = wear_cost_p
        depreciation_km    = 0

    # 3. 人工成本
    labor_cost = driver_daily + (wait_hours * wait_rate)

    # 4. 總成本
    total_cost = variable_total + fixed_per_trip + labor_cost

    # ── 結果顯示 ─────────────────────────────────────────────────────────────
    st.markdown("---")
    st.subheader("💡 精準成本分析")

    r1, r2, r3 = st.columns(3)

    with r1:
        st.markdown(
            "<div style='background:#1e3a5f;border-radius:12px;padding:16px 18px 8px;border:1px solid #2563eb;'>"
            "<div style='color:#93c5fd;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px;'>🔄 變動成本（每趟）</div>"
            "</div>", unsafe_allow_html=True
        )
        st.metric("油費",
                  f"NT$ {fuel_cost_p:,.0f}",
                  f"{p_distance}km ÷ {tcfg['fuel_eff']}L/km × {p_fuel}元")
        if use_per_km:
            st.metric("維修保養",
                      f"NT$ {maintenance_buffer:,.0f}",
                      f"maintRate {p_maint_rate}元/km × {p_distance}km")
        else:
            st.metric("維修折耗",
                      f"NT$ {wear_cost_p:,.0f}",
                      f"{tcfg['wear_cost']}元/km × {p_distance}km")
        st.metric("小計", f"NT$ {variable_total:,.0f}")

    with r2:
        st.markdown(
            "<div style='background:#2d1b69;border-radius:12px;padding:16px 18px 8px;border:1px solid #7c3aed;'>"
            "<div style='color:#c4b5fd;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px;'>🏢 折舊攤提</div>"
            "</div>", unsafe_allow_html=True
        )
        if use_per_km:
            # 模式 B：每km折舊
            st.metric("每公里折舊",
                      f"NT$ {depreciation_km:,.0f}",
                      f"depreRate {p_depre_rate}元/km × {p_distance}km")
            st.metric("小計", f"NT$ {fixed_per_trip:,.0f}")
            st.caption("使用每公里費率法，保險/牌照稅已含於 depreRate 中")
        else:
            # 模式 A：月攤提法
            st.metric("折舊攤提",
                      f"NT$ {monthly_dep/monthly_trips:,.0f}",
                      f"月折舊 {monthly_dep:,.0f} ÷ {monthly_trips} 趟")
            st.metric("保險攤提",  f"NT$ {monthly_ins_m/monthly_trips:,.0f}")
            st.metric("牌照稅攤提", f"NT$ {monthly_lic_m/monthly_trips:,.0f}")
            if monthly_other > 0:
                st.metric("其他攤提", f"NT$ {monthly_other/monthly_trips:,.0f}")
            st.metric("小計", f"NT$ {fixed_per_trip:,.0f}")

    with r3:
        st.markdown(
            "<div style='background:#1a3a2a;border-radius:12px;padding:16px 18px 8px;border:1px solid #16a34a;'>"
            "<div style='color:#86efac;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px;'>👷 人工成本</div>"
            "</div>", unsafe_allow_html=True
        )
        st.metric("司機日薪", f"NT$ {driver_daily:,.0f}")
        st.metric("等候費",   f"NT$ {wait_hours*wait_rate:,.0f}", f"{wait_hours}h × {wait_rate}元/h")
        st.metric("小計",     f"NT$ {labor_cost:,.0f}")

    st.markdown("---")

    # ── 總成本大字 + 最低報價反推 ────────────────────────────────────────────
    tot1, tot2 = st.columns(2)

    with tot1:
        st.markdown(
            f"<div style='background:#0f172a;border:2px solid #475569;border-radius:16px;"
            f"padding:24px;text-align:center;'>"
            f"<div style='color:#94a3b8;font-size:13px;font-weight:700;'>📊 精準總成本</div>"
            f"<div style='color:#f8fafc;font-size:44px;font-weight:900;margin:10px 0;'>NT$ {total_cost:,.0f}</div>"
            f"<div style='color:#64748b;font-size:11px;'>"
            f"變動 {variable_total:,.0f} ＋ 固定 {fixed_per_trip:,.0f} ＋ 人工 {labor_cost:,.0f}"
            f"</div></div>",
            unsafe_allow_html=True
        )

    with tot2:
        target_margin = st.slider("目標利潤率（%）", 5, 60, 20, key="p_margin") / 100
        min_quote     = total_cost / (1 - target_margin)
        st.markdown(
            f"<div style='background:#0f172a;border:2px solid #22c55e;border-radius:16px;"
            f"padding:24px;text-align:center;'>"
            f"<div style='color:#86efac;font-size:13px;font-weight:700;'>"
            f"✅ 最低建議報價（含 {target_margin*100:.0f}% 利潤）</div>"
            f"<div style='color:#22c55e;font-size:44px;font-weight:900;margin:10px 0;'>NT$ {min_quote:,.0f}</div>"
            f"<div style='color:#4ade80;font-size:12px;'>低於此價必虧，從此起算加碼談判</div>"
            f"</div>",
            unsafe_allow_html=True
        )

    st.markdown("---")

    # ── 客戶出價 → 淨利即時分析 ─────────────────────────────────────────────
    st.markdown("#### 💬 客戶出價 → 淨利即時分析")
    quoted_p = st.number_input(
        "客戶出價（元）", value=int(min_quote * 1.05), step=500, key="p_quoted"
    )

    profit_p   = quoted_p - total_cost
    margin_p   = (profit_p / quoted_p * 100) if quoted_p > 0 else 0
    cost_ratio = (total_cost / quoted_p * 100) if quoted_p > 0 else 100

    pa, pb, pc, pd = st.columns(4)
    pa.metric("客戶出價", f"NT$ {quoted_p:,}")
    pb.metric("精準成本", f"NT$ {total_cost:,.0f}")
    pc.metric("淨利金額", f"NT$ {profit_p:,.0f}", f"{margin_p:.1f}%",
              delta_color="normal" if profit_p >= 0 else "inverse")

    if margin_p >= 20 and profit_p > 1500:
        pd.success(f"🟢 建議接單\n利潤率 {margin_p:.1f}%")
    elif margin_p >= 10 and profit_p > 0:
        pd.warning(f"🟡 勉強接單\n{margin_p:.1f}% 利潤")
    elif profit_p > 0:
        pd.warning(f"🟠 利潤偏低\n僅 {margin_p:.1f}%，需議價")
    else:
        pd.error(f"🔴 絕對拒接\n虧損 {abs(profit_p):,.0f} 元")

    # 成本/利潤視覺化橫條
    bar_cost   = max(0, min(int(cost_ratio), 100))
    bar_profit = max(0, min(int(margin_p),   100 - bar_cost))
    bar_gap    = max(0, 100 - bar_cost - bar_profit)
    st.markdown(
        f"<div style='width:100%;height:30px;border-radius:8px;overflow:hidden;"
        f"display:flex;background:#1e293b;margin-top:12px;'>"
        f"<div style='width:{bar_cost}%;background:#ef4444;display:flex;align-items:center;"
        f"justify-content:center;color:#fff;font-size:11px;font-weight:700;'>{bar_cost:.0f}% 成本</div>"
        f"<div style='width:{bar_profit}%;background:#22c55e;display:flex;align-items:center;"
        f"justify-content:center;color:#fff;font-size:11px;font-weight:700;'>{bar_profit:.0f}% 利潤</div>"
        f"<div style='width:{bar_gap}%;background:#334155;'></div>"
        f"</div>",
        unsafe_allow_html=True
    )

    st.markdown("---")
    st.markdown(
        "**公式明細**\n"
        "- 油費 `= 油價 × 距離 ÷ 油耗效率（L/km）`\n"
        "- 維修折耗 `= 每km費率 × 距離`\n"
        "- 固定攤提 `= (月折舊 + 月保險 + 月牌照稅) ÷ 月趟次`\n"
        "- 人工 `= 司機日薪 + 等候時數 × 等候費率`\n"
        "- **最低報價** `= 總成本 ÷ (1 − 目標利潤率)`"
    )
    st.caption("每一分錢都要算清楚，利潤才能站穩。—— 富詠運輸自動化報價引擎 v2")
