"""HTTP client for integrating with Replit-hosted logistics APIs."""

from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

from .exceptions import ReplitLogisticsAPIError

DEFAULT_PROFILE: dict[str, Any] = {
    "paths": {
        "create_shipment": "/shipments",
        "get_shipment": "/shipments/{shipment_id}",
        "list_shipments": "/shipments",
        "update_shipment_status": "/shipments/{shipment_id}/status",
        "create_pickup_request": "/pickups",
    },
    "fields": {
        "create_shipment": {
            "order_id": "order_id",
            "recipient": "recipient",
            "address": "address",
            "items": "items",
            "metadata": "metadata",
        },
        "list_shipments": {
            "status": "status",
            "page": "page",
            "page_size": "page_size",
        },
        "update_shipment_status": {
            "status": "status",
            "location": "location",
            "note": "note",
        },
        "create_pickup_request": {
            "warehouse_id": "warehouse_id",
            "pickup_window": "pickup_window",
            "shipments": "shipments",
        },
    },
}


class ReplitLogisticsClient:
    """Small API client wrapper for logistics endpoints."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 10.0,
        default_headers: dict[str, str] | None = None,
        profile: dict[str, Any] | None = None,
    ) -> None:
        if not base_url:
            raise ValueError("base_url is required")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.default_headers = default_headers or {}
        self.profile = self._deep_merge(DEFAULT_PROFILE, profile or {})

    def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, *, payload: dict[str, Any] | None = None) -> Any:
        return self._request("POST", path, payload=payload)

    def put(self, path: str, *, payload: dict[str, Any] | None = None) -> Any:
        return self._request("PUT", path, payload=payload)

    def patch(self, path: str, *, payload: dict[str, Any] | None = None) -> Any:
        return self._request("PATCH", path, payload=payload)

    def delete(self, path: str, *, payload: dict[str, Any] | None = None) -> Any:
        return self._request("DELETE", path, payload=payload)

    def create_shipment(
        self,
        *,
        order_id: str,
        recipient: dict[str, Any],
        address: dict[str, Any],
        items: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        payload: dict[str, Any] = {
            self._field("create_shipment", "order_id"): order_id,
            self._field("create_shipment", "recipient"): recipient,
            self._field("create_shipment", "address"): address,
            self._field("create_shipment", "items"): items,
        }
        if metadata is not None:
            payload[self._field("create_shipment", "metadata")] = metadata
        return self.post(self._path("create_shipment"), payload=payload)

    def get_shipment(self, shipment_id: str) -> Any:
        return self.get(self._path("get_shipment", shipment_id=shipment_id))

    def list_shipments(
        self,
        *,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Any:
        params: dict[str, Any] = {
            self._field("list_shipments", "page"): page,
            self._field("list_shipments", "page_size"): page_size,
        }
        if status:
            params[self._field("list_shipments", "status")] = status
        return self.get(self._path("list_shipments"), params=params)

    def update_shipment_status(
        self,
        *,
        shipment_id: str,
        status: str,
        location: str | None = None,
        note: str | None = None,
    ) -> Any:
        payload: dict[str, Any] = {
            self._field("update_shipment_status", "status"): status
        }
        if location:
            payload[self._field("update_shipment_status", "location")] = location
        if note:
            payload[self._field("update_shipment_status", "note")] = note
        return self.patch(
            self._path("update_shipment_status", shipment_id=shipment_id),
            payload=payload,
        )

    def create_pickup_request(
        self,
        *,
        warehouse_id: str,
        pickup_window: dict[str, str],
        shipments: list[str],
    ) -> Any:
        payload = {
            self._field("create_pickup_request", "warehouse_id"): warehouse_id,
            self._field("create_pickup_request", "pickup_window"): pickup_window,
            self._field("create_pickup_request", "shipments"): shipments,
        }
        return self.post(self._path("create_pickup_request"), payload=payload)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        url = self._build_url(path, params=params)
        body_bytes: bytes | None = None
        headers = {
            "Accept": "application/json",
            "User-Agent": "replit-logistics-client/1.0",
            **self.default_headers,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        if payload is not None:
            body_bytes = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = request.Request(
            url=url,
            method=method.upper(),
            data=body_bytes,
            headers=headers,
        )

        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                raw_text = resp.read().decode("utf-8")
                if not raw_text.strip():
                    return None
                return self._safe_json_parse(raw_text)
        except error.HTTPError as exc:
            response_text = exc.read().decode("utf-8", errors="replace")
            error_payload = self._safe_json_parse(response_text)
            message = self._extract_error_message(error_payload, default=exc.reason)
            raise ReplitLogisticsAPIError(
                message=message,
                status_code=exc.code,
                code=(error_payload or {}).get("code") if isinstance(error_payload, dict) else None,
                details=(error_payload or {}).get("details") if isinstance(error_payload, dict) else None,
                response_body=error_payload if error_payload is not None else response_text,
            ) from exc
        except error.URLError as exc:
            raise ReplitLogisticsAPIError(
                message=f"Unable to connect to logistics API: {exc.reason}",
            ) from exc

    def _build_url(self, path: str, *, params: dict[str, Any] | None = None) -> str:
        safe_path = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url}{safe_path}"
        if params:
            serialized = {
                key: value
                for key, value in params.items()
                if value is not None
            }
            if serialized:
                return f"{url}?{parse.urlencode(serialized, doseq=True)}"
        return url

    def _path(self, operation: str, **path_params: str) -> str:
        template = self.profile["paths"].get(operation)
        if not template:
            raise ValueError(f"Missing path for operation: {operation}")
        try:
            return str(template).format(**path_params)
        except KeyError as exc:
            raise ValueError(
                f"Missing path param '{exc.args[0]}' for operation '{operation}'"
            ) from exc

    def _field(self, operation: str, key: str) -> str:
        operation_map = self.profile["fields"].get(operation, {})
        mapped = operation_map.get(key, key)
        return str(mapped)

    @staticmethod
    def _safe_json_parse(text: str) -> Any:
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text

    @staticmethod
    def _extract_error_message(payload: Any, *, default: str) -> str:
        if isinstance(payload, dict):
            for key in ("message", "error", "detail"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value
        return default or "Logistics API request failed"

    @staticmethod
    def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        merged: dict[str, Any] = dict(base)
        for key, value in override.items():
            if (
                key in merged
                and isinstance(merged[key], dict)
                and isinstance(value, dict)
            ):
                merged[key] = ReplitLogisticsClient._deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged
