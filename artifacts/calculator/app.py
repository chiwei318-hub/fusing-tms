import streamlit as st

st.set_page_config(page_title="富詠全台調度引擎", layout="wide")

TRUCK_TYPES = {
    "1.75噸(小發財)": {"fuel_eff": 10.0, "wear_cost": 2.0, "wage_base": 800},
    "3.5噸(堅達)":    {"fuel_eff": 7.0,  "wear_cost": 3.5, "wage_base": 1200},
    "11噸(大貨車)":   {"fuel_eff": 4.5,  "wear_cost": 6.0, "wage_base": 2000},
    "26噸(聯結車/鷗翼)": {"fuel_eff": 2.8, "wear_cost": 10.0, "wage_base": 3000},
}

st.title("🚛 富詠全台貨運：即時獲利決策系統")
st.markdown("---")

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

fuel_cost = (distance / truck_cfg["fuel_eff"]) * fuel_price
maintenance_cost = distance * truck_cfg["wear_cost"]
time_wage = (wait_time * 200) + truck_cfg["wage_base"]

if has_backload:
    actual_cost = (fuel_cost * 0.7) + maintenance_cost + time_wage
else:
    actual_cost = fuel_cost + maintenance_cost + time_wage

extra_event = st.multiselect("特殊事件附加", ["台北市區(塞車/禁行)", "偏遠山區", "夜間/假日", "需助手"])
event_fee = len(extra_event) * 500
final_cost = actual_cost + event_fee

profit = quoted_price - final_cost
margin = (profit / quoted_price) * 100 if quoted_price > 0 else 0

st.markdown("---")
c1, c2, c3, c4 = st.columns(4)

c1.metric("總預估成本", f"{int(final_cost):,} 元")
c2.metric("預估淨利", f"{int(profit):,} 元", f"{margin:.1f}%")

if profit > 1500 and margin > 20:
    c3.success("🟢 建議接單：利潤優厚")
elif profit > 0:
    c3.warning("🟡 勉強接單：利潤微薄")
else:
    c3.error("🔴 絕對拒接：這單必虧")

c4.write(f"**成本細項：**\n- 油資: {int(fuel_cost)}\n- 折舊保養: {int(maintenance_cost)}\n- 人工/時間: {int(time_wage)}\n- 事件附加: {event_fee}")

st.markdown("---")
st.caption("錢要放在會動的車上，命要握在系統的決策裡。 —— 富詠運輸")
