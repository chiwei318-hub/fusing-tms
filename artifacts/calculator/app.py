import streamlit as st
import datetime

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

st.title("🚛 富詠運輸管理平台")
st.markdown("---")

tab_boss, tab_customer = st.tabs(["📊 老闆決策引擎", "🌐 客戶自助報價"])

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
