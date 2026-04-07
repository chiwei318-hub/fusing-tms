"""HTTP client for integrating with Replit-hosted logistics APIs."""

from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

from .exceptions import ReplitLogisticsAPIError


class ReplitLogisticsClient:
    """Small API client wrapper for logistics endpoints."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 10.0,
        default_headers: dict[str, str] | None = None,
    ) -> None:
        if not base_url:
            raise ValueError("base_url is required")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.default_headers = default_headers or {}

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
            "order_id": order_id,
            "recipient": recipient,
            "address": address,
            "items": items,
        }
        if metadata:
            payload["metadata"] = metadata
        return self.post("/shipments", payload=payload)

    def get_shipment(self, shipment_id: str) -> Any:
        return self.get(f"/shipments/{shipment_id}")

    def list_shipments(
        self,
        *,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Any:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status:
            params["status"] = status
        return self.get("/shipments", params=params)

    def update_shipment_status(
        self,
        *,
        shipment_id: str,
        status: str,
        location: str | None = None,
        note: str | None = None,
    ) -> Any:
        payload: dict[str, Any] = {"status": status}
        if location:
            payload["location"] = location
        if note:
            payload["note"] = note
        return self.patch(f"/shipments/{shipment_id}/status", payload=payload)

    def create_pickup_request(
        self,
        *,
        warehouse_id: str,
        pickup_window: dict[str, str],
        shipments: list[str],
    ) -> Any:
        payload = {
            "warehouse_id": warehouse_id,
            "pickup_window": pickup_window,
            "shipments": shipments,
        }
        return self.post("/pickups", payload=payload)

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
