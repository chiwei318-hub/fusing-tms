import streamlit as st
import datetime
import math

st.set_page_config(page_title="富詠運輸系統", layout="wide")

TRUCK_TYPES = {
    "1.75噸(小發財)":    {"fuel_eff": 10.0, "wear_cost": 2.0,  "wage_base": 800},
    "3.5噸(堅達)":       {"fuel_eff": 7.0,  "wear_cost": 3.5,  "wage_base": 1200},
    "11噸(大貨車)":      {"fuel_eff": 4.5,  "wear_cost": 6.0,  "wage_base": 2000},
    "26噸(聯結車/鷗翼)": {"fuel_eff": 2.8,  "wear_cost": 10.0, "wage_base": 3000},
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

tab_boss, tab_customer, tab_surcharge = st.tabs([
    "📊 老闆決策引擎",
    "🌐 客戶自助報價",
    "🚚 車型附加費試算",
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
            checked = st.checkbox(
                f"{cfg['label']}　{'（×1.5 倍乘）' if cfg['type'] == 'multiplier' else f'（+NT$ {cfg[\"value\"]:,}）'}",
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
        rows = [
            ("底價", base_price, "基準"),
            (f"車型加權 ×{vc['multiplier']}", int(adjusted_price - base_price * vc["multiplier"]/vc["multiplier"] * 1 + base_price * vc["multiplier"]) - base_price, f"×{vc['multiplier']}"),
        ]

        detail_data = {
            "項目": ["基礎運費", f"車型加權（×{vc['multiplier']}）"],
            "金額（元）": [f"NT$ {base_price:,}", f"NT$ {int(base_price * vc['multiplier']):,}"],
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
