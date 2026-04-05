from replit import db
import requests
import time

API_KEY = "你的API_KEY"

def get_distance_info(origin: str, destination: str) -> dict:
    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": origin,
        "destinations": destination,
        "key": API_KEY,
        "language": "zh-TW",
    }
    res = requests.get(url, params=params, timeout=10).json()

    element = res["rows"][0]["elements"][0]
    if element["status"] != "OK":
        raise ValueError(f"無法取得距離資訊：{element['status']}")

    distance_m = element["distance"]["value"]
    duration   = element["duration"]["text"]
    km         = round(distance_m / 1000, 1)
    return {"km": km, "duration": duration}


def calc_price(km: float) -> int:
    return int(km * 50 + 500)


def create_order(origin: str, destination: str, customer: str) -> dict:
    info  = get_distance_info(origin, destination)
    price = calc_price(info["km"])

    order = {
        "客戶": customer,
        "起點": origin,
        "終點": destination,
        "距離(km)": info["km"],
        "時間": info["duration"],
        "價格": price,
        "狀態": "待派車",
        "建立時間": int(time.time()),
    }

    order_id = f"order_{int(time.time() * 1000)}"
    db[order_id] = order
    print(f"✅ 訂單已建立：{order_id}")
    return {order_id: order}


def list_orders() -> None:
    keys = [k for k in db.keys() if k.startswith("order_")]
    if not keys:
        print("目前無訂單")
        return
    for k in sorted(keys):
        o = db[k]
        print(f"[{k}] {o['客戶']} | {o['起點']} → {o['終點']} | {o['距離(km)']}km | NT${o['價格']} | {o['狀態']}")


if __name__ == "__main__":
    create_order("桃園", "台北", "王先生")
    print()
    list_orders()
