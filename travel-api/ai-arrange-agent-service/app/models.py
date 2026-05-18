from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AgentStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    FAILED = "FAILED"


class ToolStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    SKIPPED = "SKIPPED"
    FAILED = "FAILED"


class PlaceType(str, Enum):
    SCENIC = "SCENIC"
    RESTAURANT = "RESTAURANT"
    HOTEL = "HOTEL"
    TRANSPORT = "TRANSPORT"
    SHOPPING = "SHOPPING"
    ACTIVITY = "ACTIVITY"
    OTHER = "OTHER"


class PlaceSource(str, Enum):
    AI = "AI"
    AMAP = "AMAP"
    GOOGLE = "GOOGLE"
    INTERNAL_OFFER = "INTERNAL_OFFER"


class TripCoreSlots(BaseModel):
    model_config = ConfigDict(extra="allow")

    city: str | None = None
    travelStartDate: date | None = None
    travelEndDate: date | None = None
    peopleCount: int | None = None
    budget: str | None = None
    travelStyle: str | None = None
    accommodationPreference: str | None = None
    transportPreference: str | None = None
    notes: str | None = None
    mustVisitKeywords: list[str] = Field(default_factory=list)
    avoidKeywords: list[str] = Field(default_factory=list)

    def missing_required_slots(self) -> list[str]:
        missing: list[str] = []
        if not self.city:
            missing.append("city")
        if self.travelStartDate is None:
            missing.append("travelStartDate")
        if self.peopleCount is None or self.peopleCount < 1:
            missing.append("peopleCount")
        return missing

    def day_count(self) -> int:
        if self.travelStartDate is None:
            return 1
        end_date = self.travelEndDate or self.travelStartDate
        return max((end_date - self.travelStartDate).days + 1, 1)


class PlannerPlaceSuggestion(BaseModel):
    model_config = ConfigDict(extra="allow")

    placeId: UUID | None = None
    name: str
    type: PlaceType = PlaceType.OTHER
    source: PlaceSource = PlaceSource.AI
    internalOfferId: UUID | None = None
    amapPoiId: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None
    imageUrl: str | None = None
    description: str | None = None
    selected: bool = False
    tags: list[str] = Field(default_factory=list)


class PlannerRouteSegment(BaseModel):
    model_config = ConfigDict(extra="allow")

    fromPlaceId: UUID | None = None
    toPlaceId: UUID | None = None
    transportMode: str | None = None
    distanceKm: float | None = None
    estimatedMinutes: int | None = None
    polyline: str | None = None
    summary: str | None = None


class PlannerSnapshotRef(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: int | None = None
    markdown: str | None = None
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)


class PlannerHistoryMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: str
    content: str
    model: str | None = None
    createdAt: str | None = None


class UserContext(BaseModel):
    model_config = ConfigDict(extra="allow")

    travelPreferences: dict[str, Any] = Field(default_factory=dict)
    historicalTrips: list[dict[str, Any]] = Field(default_factory=list)
    familyProfile: dict[str, Any] = Field(default_factory=dict)
    budgetProfile: dict[str, Any] = Field(default_factory=dict)


class AgentRunRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    conversationId: UUID
    userId: UUID
    coreSlots: TripCoreSlots
    userMessage: str = ""
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    latestSnapshot: PlannerSnapshotRef | None = None
    history: list[PlannerHistoryMessage] = Field(default_factory=list)
    userContext: UserContext | None = None


class AgentWarning(BaseModel):
    code: str
    message: str
    source: str = "agent"


class ToolCall(BaseModel):
    tool: str
    status: ToolStatus
    latencyMs: int = 0
    detail: str | None = None
    retryCount: int = 0


class UserFacingEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str = "TOOL_STATUS"
    message: str
    status: str
    tool: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentRunResponse(BaseModel):
    traceId: str
    status: AgentStatus
    assistantText: str
    title: str
    summary: str | None = None
    markdown: str
    nextQuestion: str | None = None
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    toolCalls: list[ToolCall] = Field(default_factory=list)
    warnings: list[AgentWarning] = Field(default_factory=list)
    userFacingEvents: list[UserFacingEvent] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    modelProvider: str
    model: str
    deepseekConfigured: bool
    amapConfigured: bool


def model_dump_jsonable(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json", exclude_none=True)
