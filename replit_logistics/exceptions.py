"""Custom exceptions for Replit logistics client."""

from __future__ import annotations

from typing import Any


class ReplitLogisticsAPIError(Exception):
    """Raised when Replit logistics API request fails."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        details: Any = None,
        response_body: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details
        self.response_body = response_body

    def __str__(self) -> str:
        segments = [self.message]
        if self.status_code is not None:
            segments.append(f"status={self.status_code}")
        if self.code:
            segments.append(f"code={self.code}")
        return " | ".join(segments)
