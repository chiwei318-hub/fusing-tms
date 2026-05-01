"""Example usage for Replit logistics API client."""

from __future__ import annotations

import os

from replit_logistics import ReplitLogisticsAPIError, ReplitLogisticsClient


def main() -> None:
    base_url = os.getenv("REPLIT_LOGISTICS_BASE_URL", "").strip()
    api_key = os.getenv("REPLIT_LOGISTICS_API_KEY", "").strip() or None

    if not base_url:
        raise SystemExit("Please set REPLIT_LOGISTICS_BASE_URL environment variable.")

    client = ReplitLogisticsClient(base_url=base_url, api_key=api_key, timeout=10.0)

    try:
        result = client.list_shipments(status="pending", page=1, page_size=10)
        print("Pending shipments:", result)
    except ReplitLogisticsAPIError as exc:
        print("Failed to call logistics API:", exc)


if __name__ == "__main__":
    main()
