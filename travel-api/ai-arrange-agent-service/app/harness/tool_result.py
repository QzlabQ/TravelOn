from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ToolStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    SKIPPED = "SKIPPED"
    FAILED = "FAILED"


class ToolWarning(BaseModel):
    model_config = ConfigDict(extra="allow")

    code: str
    message: str
    source: str


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    tool: str
    status: ToolStatus
    data: Any | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    warnings: list[ToolWarning] = Field(default_factory=list)
    errorCode: str | None = None
    errorMessage: str | None = None
    latencyMs: int = 0
    retryCount: int = 0
    userMessage: str | None = None
    inputSummary: str | None = None
    outputSummary: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.status in {ToolStatus.SUCCESS, ToolStatus.PARTIAL_SUCCESS, ToolStatus.SKIPPED}
