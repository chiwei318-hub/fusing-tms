# Replit 物流 API 介面

這個專案提供一個可重用的 Python 客戶端，協助你在自己的系統中串接 Replit 上部署的物流 API。

## 功能

- 支援通用 HTTP 方法：`GET / POST / PUT / PATCH / DELETE`
- 內建常見物流操作：
  - 建立出貨單 `create_shipment`
  - 查詢出貨單 `get_shipment`
  - 列出出貨單 `list_shipments`
  - 更新物流狀態 `update_shipment_status`
  - 建立取件需求 `create_pickup_request`
- 統一錯誤型別 `ReplitLogisticsAPIError`（含 status code / error code / details）
- 支援 `profile` 自訂 endpoint 與欄位映射，快速對齊你實際的 Replit API 規格

## 專案結構

```text
replit_logistics/
  __init__.py
  client.py
  exceptions.py
examples/
  basic_usage.py
tests/
  test_client.py
```

## 快速使用

```python
from replit_logistics import ReplitLogisticsClient, ReplitLogisticsAPIError

client = ReplitLogisticsClient(
    base_url="https://your-replit-app.replit.app/api/v1",
    api_key="YOUR_API_KEY",
    timeout=10.0,
)

try:
    created = client.create_shipment(
        order_id="ORD-1001",
        recipient={"name": "王小明", "phone": "0912345678"},
        address={
            "line1": "台北市信義區松高路1號",
            "city": "Taipei",
            "postal_code": "110",
            "country": "TW",
        },
        items=[
            {"sku": "SKU-001", "name": "商品A", "qty": 2},
            {"sku": "SKU-008", "name": "商品B", "qty": 1},
        ],
        metadata={"channel": "web"},
    )
    print("Shipment created:", created)
except ReplitLogisticsAPIError as exc:
    print("API error:", exc)
```

## 對接你的實際 Replit API 規格（推薦）

若你的 API endpoint 或欄位名稱不同，可透過 `profile` 覆蓋：

```python
from replit_logistics import ReplitLogisticsClient

profile = {
    "paths": {
        "create_shipment": "/v2/orders",
        "get_shipment": "/v2/orders/{shipment_id}",
        "list_shipments": "/v2/orders",
        "update_shipment_status": "/v2/orders/{shipment_id}/tracking",
        "create_pickup_request": "/v2/pickup-requests",
    },
    "fields": {
        "create_shipment": {
            "order_id": "orderNo",
            "recipient": "consignee",
            "address": "destination",
            "items": "products",
            "metadata": "extra",
        },
        "list_shipments": {
            "status": "state",
            "page": "pageIndex",
            "page_size": "pageSize",
        },
        "update_shipment_status": {
            "status": "state",
            "location": "currentLocation",
            "note": "remark",
        },
        "create_pickup_request": {
            "warehouse_id": "hubId",
            "pickup_window": "window",
            "shipments": "orderIds",
        },
    },
}

client = ReplitLogisticsClient(
    base_url="https://your-replit-app.replit.app/api/v2",
    api_key="YOUR_API_KEY",
    profile=profile,
)
```

### profile 可用的 operation keys

- `create_shipment`
- `get_shipment`
- `list_shipments`
- `update_shipment_status`
- `create_pickup_request`

## 測試

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

## 介接建議

1. 將 `base_url` 指向你的 Replit 物流 API 網址。
2. 以環境變數管理 `api_key`（不要硬編碼）。
3. 在應用層捕捉 `ReplitLogisticsAPIError`，統一轉為你的系統錯誤格式。
