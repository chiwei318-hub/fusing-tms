import streamlit as st

st.set_page_config(
    page_title="麒巍專屬：物流營運決策精算器",
    page_icon="🚛",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
<style>
    .main-title {
        text-align: center;
        color: #1a3a5c;
        font-size: 2rem;
        font-weight: 800;
        padding: 1rem 0;
        border-bottom: 3px solid #e8a020;
        margin-bottom: 1.5rem;
    }
    .section-header {
        background: linear-gradient(90deg, #1a3a5c, #2e6da4);
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-weight: 700;
        margin: 1rem 0 0.5rem 0;
    }
    .result-box {
        background: #f0f7ff;
        border: 1px solid #2e6da4;
        border-radius: 8px;
        padding: 1rem;
        margin: 0.5rem 0;
    }
    .profit-positive {
        color: #1a7a1a;
        font-size: 1.6rem;
        font-weight: 800;
    }
    .profit-negative {
        color: #cc1a1a;
        font-size: 1.6rem;
        font-weight: 800;
    }
    .metric-label {
        font-size: 0.85rem;
        color: #555;
        margin-bottom: 0.1rem;
    }
    .metric-value {
        font-size: 1.15rem;
        font-weight: 700;
        color: #1a3a5c;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<div class="main-title">🚛 麒巍專屬：物流營運決策精算器</div>', unsafe_allow_html=True)

tab1, tab2, tab3 = st.tabs(["📦 單次行程精算", "🚌 車隊多趟排班精算", "⛽ 油耗基準設定"])

# ── 油耗基準設定 (Tab 3 – shared config) ──────────────────────────────────────
with tab3:
    st.markdown('<div class="section-header">⛽ 車型油耗基準設定</div>', unsafe_allow_html=True)
    st.info("在此設定各車型的基準油耗（公升/公里），這些設定會套用到其他精算分頁。")

    col1, col2 = st.columns(2)
    with col1:
        fuel_price_global = st.number_input("現行柴油價格（元/公升）", min_value=20.0, max_value=50.0, value=32.5, step=0.1, key="global_fuel_price")
        consumption_3t = st.number_input("3噸貨車 油耗（升/百公里）", min_value=5.0, max_value=30.0, value=12.0, step=0.5, key="c_3t")
        consumption_5t = st.number_input("5噸貨車 油耗（升/百公里）", min_value=5.0, max_value=30.0, value=14.0, step=0.5, key="c_5t")
        consumption_8t = st.number_input("8噸貨車 油耗（升/百公里）", min_value=5.0, max_value=30.0, value=18.0, step=0.5, key="c_8t")
    with col2:
        consumption_10t = st.number_input("10噸貨車 油耗（升/百公里）", min_value=5.0, max_value=30.0, value=22.0, step=0.5, key="c_10t")
        consumption_15t = st.number_input("15噸聯結車 油耗（升/百公里）", min_value=5.0, max_value=40.0, value=28.0, step=0.5, key="c_15t")
        consumption_20t = st.number_input("20噸聯結車 油耗（升/百公里）", min_value=5.0, max_value=40.0, value=32.0, step=0.5, key="c_20t")
        consumption_custom = st.number_input("自訂車型 油耗（升/百公里）", min_value=1.0, max_value=60.0, value=16.0, step=0.5, key="c_custom")

    vehicle_configs = {
        "3噸貨車": consumption_3t,
        "5噸貨車": consumption_5t,
        "8噸貨車": consumption_8t,
        "10噸貨車": consumption_10t,
        "15噸聯結車": consumption_15t,
        "20噸聯結車": consumption_20t,
        "自訂車型": consumption_custom,
    }

    st.markdown('<div class="section-header">📊 油耗成本速查表</div>', unsafe_allow_html=True)
    col_headers = st.columns([2, 1, 1, 1, 1, 1])
    col_headers[0].markdown("**車型**")
    col_headers[1].markdown("**50km 油費**")
    col_headers[2].markdown("**100km 油費**")
    col_headers[3].markdown("**200km 油費**")
    col_headers[4].markdown("**300km 油費**")
    col_headers[5].markdown("**500km 油費**")
    for vtype, cons in vehicle_configs.items():
        cols = st.columns([2, 1, 1, 1, 1, 1])
        cols[0].write(vtype)
        for i, km in enumerate([50, 100, 200, 300, 500]):
            cost = (cons / 100) * km * fuel_price_global
            cols[i + 1].write(f"${cost:,.0f}")

# ── 單次行程精算 (Tab 1) ────────────────────────────────────────────────────────
with tab1:
    st.markdown('<div class="section-header">📦 基本行程資訊</div>', unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1:
        trip_distance = st.number_input("行程距離（公里）", min_value=1.0, max_value=3000.0, value=150.0, step=10.0)
        vehicle_type = st.selectbox("車型", list(vehicle_configs.keys()), index=2)
        is_roundtrip = st.checkbox("來回計算（距離×2）", value=False)
    with c2:
        freight_income = st.number_input("客戶運費收入（元）", min_value=0.0, max_value=500000.0, value=8000.0, step=100.0)
        tolls = st.number_input("過路費/過橋費（元）", min_value=0.0, max_value=10000.0, value=300.0, step=50.0)
        fuel_price_t1 = st.number_input("柴油單價（元/升）", min_value=20.0, max_value=50.0, value=st.session_state.get("global_fuel_price", 32.5), step=0.1)
    with c3:
        driver_cost = st.number_input("司機薪資/趟費（元）", min_value=0.0, max_value=10000.0, value=1200.0, step=100.0)
        misc_cost = st.number_input("雜支費用（裝卸/停車等）（元）", min_value=0.0, max_value=5000.0, value=200.0, step=50.0)
        subcontract_cost = st.number_input("外包運費（元，若有）", min_value=0.0, max_value=100000.0, value=0.0, step=500.0)

    st.markdown('<div class="section-header">🔢 精算結果</div>', unsafe_allow_html=True)

    effective_distance = trip_distance * 2 if is_roundtrip else trip_distance
    consumption_rate = vehicle_configs.get(vehicle_type, 16.0)
    fuel_liters = (consumption_rate / 100) * effective_distance
    fuel_cost = fuel_liters * fuel_price_t1
    total_cost = fuel_cost + tolls + driver_cost + misc_cost + subcontract_cost
    net_profit = freight_income - total_cost
    margin_pct = (net_profit / freight_income * 100) if freight_income > 0 else 0
    cost_per_km = total_cost / effective_distance if effective_distance > 0 else 0

    r1, r2, r3, r4 = st.columns(4)
    with r1:
        st.metric("燃油成本", f"${fuel_cost:,.0f}", f"{fuel_liters:.1f} 升")
    with r2:
        st.metric("總成本", f"${total_cost:,.0f}", f"每公里 ${cost_per_km:.1f}")
    with r3:
        delta_color = "normal" if net_profit >= 0 else "inverse"
        st.metric("淨利潤", f"${net_profit:,.0f}", f"{margin_pct:.1f}% 毛利率", delta_color=delta_color)
    with r4:
        breakeven = total_cost
        st.metric("損益兩平運費", f"${breakeven:,.0f}", "最低報價參考")

    st.markdown("---")
    col_detail, col_chart = st.columns([1, 1])
    with col_detail:
        st.markdown("**成本明細**")
        cost_items = {
            "燃油費": fuel_cost,
            "過路/橋費": tolls,
            "司機費用": driver_cost,
            "雜支費用": misc_cost,
            "外包運費": subcontract_cost,
        }
        for item, val in cost_items.items():
            pct = (val / total_cost * 100) if total_cost > 0 else 0
            st.write(f"• {item}：**${val:,.0f}**（{pct:.1f}%）")
        st.write(f"---")
        st.write(f"• 總成本：**${total_cost:,.0f}**")
        st.write(f"• 運費收入：**${freight_income:,.0f}**")
        profit_style = "profit-positive" if net_profit >= 0 else "profit-negative"
        profit_emoji = "✅" if net_profit >= 0 else "❌"
        st.markdown(f'{profit_emoji} 淨利潤：<span class="{profit_style}">${net_profit:,.0f}</span>', unsafe_allow_html=True)

    with col_chart:
        st.markdown("**報價建議**")
        scenarios = [
            ("損益兩平（0%）", total_cost, 0),
            ("微利報價（5%）", total_cost / 0.95, 5),
            ("標準報價（10%）", total_cost / 0.90, 10),
            ("合理報價（15%）", total_cost / 0.85, 15),
            ("優質報價（20%）", total_cost / 0.80, 20),
            ("高毛利報價（25%）", total_cost / 0.75, 25),
        ]
        for label, price, margin in scenarios:
            diff = price - freight_income
            diff_str = f"（高於現報價 ${diff:,.0f}）" if diff > 0 else f"（低於現報價 ${abs(diff):,.0f}）" if diff < 0 else "（與現報價相同）"
            flag = "🟢" if margin >= 15 else "🟡" if margin >= 5 else "🔴"
            st.write(f"{flag} {label}：**${price:,.0f}** {diff_str}")

# ── 車隊多趟排班精算 (Tab 2) ───────────────────────────────────────────────────
with tab2:
    st.markdown('<div class="section-header">🚌 車隊排班設定</div>', unsafe_allow_html=True)
    st.info("設定當日車隊的排班計畫，計算整體車隊的收支總覽與每台車的盈虧。")

    c1, c2 = st.columns([1, 2])
    with c1:
        num_vehicles = st.number_input("今日出車台數", min_value=1, max_value=20, value=3, step=1)
        fuel_price_t2 = st.number_input("今日柴油價格（元/升）", min_value=20.0, max_value=50.0, value=st.session_state.get("global_fuel_price", 32.5), step=0.1)
        shared_fixed_cost = st.number_input("車隊共用固定成本（元）", min_value=0.0, max_value=50000.0, value=0.0, step=500.0, help="如：車行管理費、調度費等分攤至整體")

    st.markdown('<div class="section-header">🚛 各車行程資料輸入</div>', unsafe_allow_html=True)

    vehicle_results = []
    for i in range(int(num_vehicles)):
        with st.expander(f"🚛 第 {i+1} 台車", expanded=(i == 0)):
            vc1, vc2, vc3, vc4 = st.columns(4)
            with vc1:
                v_plate = st.text_input(f"車牌號碼", value=f"ABC-{1000+i}", key=f"plate_{i}")
                v_type = st.selectbox("車型", list(vehicle_configs.keys()), index=2, key=f"vtype_{i}")
            with vc2:
                num_trips = st.number_input("今日行程趟數", min_value=1, max_value=10, value=2, step=1, key=f"trips_{i}")
                v_driver = st.number_input("司機日薪（元）", min_value=0.0, max_value=5000.0, value=1800.0, step=100.0, key=f"driver_{i}")
            with vc3:
                v_misc = st.number_input("雜支費用（元）", min_value=0.0, max_value=5000.0, value=200.0, step=50.0, key=f"misc_{i}")
                v_subcontract = st.number_input("外包費用（元）", min_value=0.0, max_value=50000.0, value=0.0, step=500.0, key=f"sub_{i}")
            with vc4:
                v_tolls = st.number_input("過路費合計（元）", min_value=0.0, max_value=5000.0, value=0.0, step=50.0, key=f"tolls_{i}")

            total_freight_v = 0.0
            total_distance_v = 0.0
            for j in range(int(num_trips)):
                tc1, tc2, tc3 = st.columns(3)
                with tc1:
                    t_dist = st.number_input(f"第{j+1}趟 距離（km）", min_value=1.0, max_value=2000.0, value=80.0, step=10.0, key=f"dist_{i}_{j}")
                    t_round = st.checkbox(f"第{j+1}趟 來回？", value=False, key=f"round_{i}_{j}")
                with tc2:
                    t_freight = st.number_input(f"第{j+1}趟 運費收入（元）", min_value=0.0, max_value=200000.0, value=3500.0, step=200.0, key=f"freight_{i}_{j}")
                with tc3:
                    effective_d = t_dist * 2 if t_round else t_dist
                    cons = vehicle_configs.get(v_type, 16.0)
                    fuel_l = (cons / 100) * effective_d
                    fuel_c = fuel_l * fuel_price_t2
                    st.metric(f"第{j+1}趟 油費", f"${fuel_c:,.0f}", f"{fuel_l:.1f}升 / {effective_d:.0f}km")

                effective_dist_j = t_dist * 2 if t_round else t_dist
                total_distance_v += effective_dist_j
                total_freight_v += t_freight

            cons_v = vehicle_configs.get(v_type, 16.0)
            total_fuel_liters_v = (cons_v / 100) * total_distance_v
            total_fuel_cost_v = total_fuel_liters_v * fuel_price_t2
            total_cost_v = total_fuel_cost_v + v_driver + v_misc + v_subcontract + v_tolls
            net_v = total_freight_v - total_cost_v
            margin_v = (net_v / total_freight_v * 100) if total_freight_v > 0 else 0

            rv1, rv2, rv3, rv4 = st.columns(4)
            rv1.metric("總距離", f"{total_distance_v:.0f} km")
            rv2.metric("總油費", f"${total_fuel_cost_v:,.0f}")
            rv3.metric("總成本", f"${total_cost_v:,.0f}")
            rv4.metric("淨利潤", f"${net_v:,.0f}", f"{margin_v:.1f}%", delta_color="normal" if net_v >= 0 else "inverse")

            vehicle_results.append({
                "plate": v_plate,
                "type": v_type,
                "trips": int(num_trips),
                "distance": total_distance_v,
                "freight": total_freight_v,
                "fuel_cost": total_fuel_cost_v,
                "total_cost": total_cost_v,
                "net_profit": net_v,
                "margin": margin_v,
            })

    st.markdown('<div class="section-header">📊 車隊整體收支總覽</div>', unsafe_allow_html=True)

    fleet_total_freight = sum(v["freight"] for v in vehicle_results)
    fleet_total_cost = sum(v["total_cost"] for v in vehicle_results) + shared_fixed_cost
    fleet_total_fuel = sum(v["fuel_cost"] for v in vehicle_results)
    fleet_total_distance = sum(v["distance"] for v in vehicle_results)
    fleet_net = fleet_total_freight - fleet_total_cost
    fleet_margin = (fleet_net / fleet_total_freight * 100) if fleet_total_freight > 0 else 0

    fc1, fc2, fc3, fc4, fc5 = st.columns(5)
    fc1.metric("出車台數", f"{len(vehicle_results)} 台")
    fc2.metric("總行駛距離", f"{fleet_total_distance:,.0f} km")
    fc3.metric("總運費收入", f"${fleet_total_freight:,.0f}")
    fc4.metric("總運營成本", f"${fleet_total_cost:,.0f}", f"油費 ${fleet_total_fuel:,.0f}")
    fc5.metric("整體淨利潤", f"${fleet_net:,.0f}", f"{fleet_margin:.1f}% 毛利率", delta_color="normal" if fleet_net >= 0 else "inverse")

    st.markdown("**各車盈虧明細**")
    for v in vehicle_results:
        flag = "🟢" if v["net_profit"] >= 0 else "🔴"
        st.write(
            f"{flag} **{v['plate']}**（{v['type']}）｜"
            f"{v['trips']}趟 / {v['distance']:.0f}km｜"
            f"收入 **${v['freight']:,.0f}**｜"
            f"成本 **${v['total_cost']:,.0f}**｜"
            f"淨利 **${v['net_profit']:,.0f}**（{v['margin']:.1f}%）"
        )

    if fleet_net >= 0:
        st.success(f"✅ 今日車隊整體獲利 **${fleet_net:,.0f}**，毛利率 **{fleet_margin:.1f}%**")
    else:
        st.error(f"❌ 今日車隊整體虧損 **${abs(fleet_net):,.0f}**，需檢討運費定價或削減成本")
