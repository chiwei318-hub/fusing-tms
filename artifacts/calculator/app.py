import streamlit as st

st.set_page_config(page_title="富詠運輸戰情室", layout="centered")

st.title("🚛 麒巍實戰：物流營運與保養監控")
st.markdown("---")

tab1, tab2 = st.tabs(["💰 營運利潤精算", "🔧 車輛保養預警"])

# --- Tab 1: 營運利潤精算 ---
with tab1:
    st.subheader("📦 單趟運費與利潤估算")
    col1, col2 = st.columns(2)
    with col1:
        dist = st.number_input("單趟總里程 (km)", value=100.0, step=1.0)
        fuel_price = st.number_input("今日油價 (元/L)", value=28.5, step=0.1)
        km_per_l = st.number_input("車輛平均油耗 (km/L)", value=5.5, step=0.1)
    with col2:
        revenue = st.number_input("該趟運費報價 (元)", value=5000, step=100)
        driver_wage = st.number_input("司機趟薪 (元)", value=1200, step=50)
        other_cost = st.number_input("其他成本 (如規費)", value=0, step=10)

    fuel_cost = (dist / km_per_l) * fuel_price
    total_cost = fuel_cost + driver_wage + other_cost
    profit = revenue - total_cost
    margin = (profit / revenue) * 100 if revenue > 0 else 0

    st.markdown("### 📊 營運效益分析")
    c1, c2, c3 = st.columns(3)
    c1.metric("預估油資", f"{int(fuel_cost):,} 元")
    c2.metric("單趟毛利", f"{int(profit):,} 元", f"{margin:.1f}%")
    c3.metric("總成本", f"{int(total_cost):,} 元", delta_color="inverse")

    if margin < 15:
        st.error("⚠️ 警告：毛利過低，請重新評估報價！")
    elif margin > 30:
        st.success("✅ 優質單：利潤空間充足。")

# --- Tab 2: 車輛保養預警 ---
with tab2:
    st.subheader("🛠️ 車輛健康管理 (5,000km/盤)")
    st.info("請輸入車輛當前總里程，系統將自動判斷保養剩餘距離。")

    current_odometer = st.number_input("車輛當前總里程 (km)", value=50000, step=100)
    interval = 5000
    last_service = (current_odometer // interval) * interval
    next_service = last_service + interval
    remaining = next_service - current_odometer

    progress = remaining / interval

    st.write(f"上次保養里程參考：**{last_service:,} km**")
    st.write(f"下次大保養目標：**{next_service:,} km**")

    if remaining > 1000:
        st.progress(progress)
        st.success(f"距離保養還有 **{remaining:,} km**，車況安全。")
    elif 500 < remaining <= 1000:
        st.progress(progress)
        st.warning(f"注意：距離保養僅剩 **{remaining:,} km**，請開始安排進廠時間。")
    else:
        st.progress(progress)
        st.error(f"🚨 嚴重預警：僅剩 **{remaining:,} km**！請立即停止長途排班並安排進廠。")

st.markdown("---")
st.caption("富詠運輸：穩定獲利、自動化管理。")
