from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch
from urllib import error

from replit_logistics import (
    ReplitLogisticsAPIError,
    ReplitLogisticsClient,
)


class TestReplitLogisticsClient(unittest.TestCase):
    def test_build_url_with_query(self) -> None:
        client = ReplitLogisticsClient(base_url="https://api.example.com")
        url = client._build_url("/shipments", params={"status": "pending", "page": 2, "q": None})
        self.assertEqual(url, "https://api.example.com/shipments?status=pending&page=2")

    @patch("replit_logistics.client.request.urlopen")
    def test_get_success_returns_json(self, mock_urlopen: MagicMock) -> None:
        body = json.dumps({"ok": True}).encode("utf-8")
        response = MagicMock()
        response.read.return_value = body

        mock_context = MagicMock()
        mock_context.__enter__.return_value = response
        mock_context.__exit__.return_value = False
        mock_urlopen.return_value = mock_context

        client = ReplitLogisticsClient(base_url="https://api.example.com", api_key="token")
        result = client.get("/health")

        self.assertEqual(result, {"ok": True})
        args, kwargs = mock_urlopen.call_args
        req = args[0]
        self.assertEqual(req.get_method(), "GET")
        self.assertEqual(req.full_url, "https://api.example.com/health")
        self.assertEqual(req.headers.get("Authorization"), "Bearer token")
        self.assertEqual(kwargs["timeout"], 10.0)

    @patch("replit_logistics.client.request.urlopen")
    def test_http_error_is_wrapped(self, mock_urlopen: MagicMock) -> None:
        http_error = error.HTTPError(
            url="https://api.example.com/shipments",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=MagicMock(),
        )
        http_error.read = MagicMock(
            return_value=json.dumps(
                {
                    "message": "invalid payload",
                    "code": "VALIDATION_ERROR",
                    "details": {"field": "order_id"},
                }
            ).encode("utf-8")
        )
        mock_urlopen.side_effect = http_error

        client = ReplitLogisticsClient(base_url="https://api.example.com")
        with self.assertRaises(ReplitLogisticsAPIError) as ctx:
            client.post("/shipments", payload={"order_id": ""})

        err = ctx.exception
        self.assertEqual(err.status_code, 400)
        self.assertEqual(err.code, "VALIDATION_ERROR")
        self.assertEqual(err.details, {"field": "order_id"})
        self.assertEqual(err.message, "invalid payload")

    @patch("replit_logistics.client.request.urlopen")
    def test_network_error_is_wrapped(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.side_effect = error.URLError("timeout")
        client = ReplitLogisticsClient(base_url="https://api.example.com")

        with self.assertRaises(ReplitLogisticsAPIError) as ctx:
            client.get("/shipments")

        self.assertIn("Unable to connect", str(ctx.exception))

    @patch("replit_logistics.client.ReplitLogisticsClient.post")
    def test_create_shipment_calls_expected_path(self, mock_post: MagicMock) -> None:
        mock_post.return_value = {"id": "shp_1"}
        client = ReplitLogisticsClient(base_url="https://api.example.com")
        result = client.create_shipment(
            order_id="ORD-1",
            recipient={"name": "A"},
            address={"line1": "B"},
            items=[{"sku": "X", "qty": 1}],
        )

        self.assertEqual(result, {"id": "shp_1"})
        mock_post.assert_called_once()
        self.assertEqual(mock_post.call_args.args[0], "/shipments")
        payload = mock_post.call_args.kwargs["payload"]
        self.assertEqual(payload["order_id"], "ORD-1")
        self.assertEqual(payload["recipient"], {"name": "A"})
        self.assertEqual(payload["address"], {"line1": "B"})
        self.assertEqual(payload["items"], [{"sku": "X", "qty": 1}])

    @patch("replit_logistics.client.ReplitLogisticsClient.post")
    def test_create_shipment_with_profile_mapping(self, mock_post: MagicMock) -> None:
        mock_post.return_value = {"id": "shipment_99"}
        profile = {
            "paths": {"create_shipment": "/v2/orders"},
            "fields": {
                "create_shipment": {
                    "order_id": "orderNo",
                    "recipient": "consignee",
                    "address": "destination",
                    "items": "products",
                    "metadata": "extra",
                }
            },
        }

        client = ReplitLogisticsClient(
            base_url="https://api.example.com",
            profile=profile,
        )
        client.create_shipment(
            order_id="ORD-777",
            recipient={"name": "A"},
            address={"line1": "B"},
            items=[{"sku": "X", "qty": 1}],
            metadata={"source": "mobile"},
        )

        self.assertEqual(mock_post.call_args.args[0], "/v2/orders")
        payload = mock_post.call_args.kwargs["payload"]
        self.assertEqual(payload["orderNo"], "ORD-777")
        self.assertEqual(payload["consignee"], {"name": "A"})
        self.assertEqual(payload["destination"], {"line1": "B"})
        self.assertEqual(payload["products"], [{"sku": "X", "qty": 1}])
        self.assertEqual(payload["extra"], {"source": "mobile"})

    def test_path_missing_param_raises_value_error(self) -> None:
        client = ReplitLogisticsClient(base_url="https://api.example.com")
        with self.assertRaises(ValueError):
            client._path("get_shipment")


if __name__ == "__main__":
    unittest.main()
