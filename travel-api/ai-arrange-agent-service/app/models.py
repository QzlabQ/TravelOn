from __future__ import annotations

from datetime import date as Date, datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AgentStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    FAILED = "FAILED"


class ToolStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    SKIPPED = "SKIPPED"
    FAILED = "FAILED"


class PlanningMode(str, Enum):
    INITIAL_PLAN = "INITIAL_PLAN"
    REFINE_WITH_SELECTION = "REFINE_WITH_SELECTION"
    ASK_MORE_OPTIONS = "ASK_MORE_OPTIONS"
    FINALIZE_PLAN = "FINALIZE_PLAN"


class PlanningScope(str, Enum):
    DAY_PLAN = "DAY_PLAN"
    DAY_REFINE = "DAY_REFINE"
    TRIP_ASSEMBLE = "TRIP_ASSEMBLE"


class PlannerModelVariant(str, Enum):
    FLASH = "FLASH"
    PRO = "PRO"


class PlannerNextAction(str, Enum):
    ASK_USER_SELECTION = "ASK_USER_SELECTION"
    NEED_MORE_INFO = "NEED_MORE_INFO"
    PLAN_UPDATED = "PLAN_UPDATED"
    COMPLETE = "COMPLETE"


class PlannerStreamEventType(str, Enum):
    RUN_STARTED = "RUN_STARTED"
    TOOL_STARTED = "TOOL_STARTED"
    TOOL_FINISHED = "TOOL_FINISHED"
    MODEL_STARTED = "MODEL_STARTED"
    MODEL_FINISHED = "MODEL_FINISHED"
    FALLBACK_USED = "FALLBACK_USED"
    OPTIONS_READY = "OPTIONS_READY"
    SNAPSHOT_DRAFT_READY = "SNAPSHOT_DRAFT_READY"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_FAILED = "RUN_FAILED"


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


class PlannerOptionType(str, Enum):
    PLACE = "PLACE"
    HOTEL = "HOTEL"
    ROUTE = "ROUTE"
    FOOD = "FOOD"
    TRANSPORT = "TRANSPORT"
    BUDGET = "BUDGET"
    STYLE = "STYLE"
    DAY_ACTION = "DAY_ACTION"
    FINALIZE = "FINALIZE"


class TripCoreSlots(BaseModel):
    model_config = ConfigDict(extra="allow")

    departureCity: str | None = None
    city: str | None = None
    travelStartDate: Date | None = None
    travelEndDate: Date | None = None
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


class PlannerBookingLink(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    label: str
    url: str
    hotelId: int | None = None
    ticketOfferId: str | None = None
    routeFrom: str | None = None
    routeTo: str | None = None
    departureDate: Date | None = None
    bookingCode: str | None = None
    provider: str | None = None
    price: float | int | None = None


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
    imageUrls: list[str] = Field(default_factory=list)
    description: str | None = None
    selected: bool = False
    tags: list[str] = Field(default_factory=list)
    bookingLinks: list[PlannerBookingLink] = Field(default_factory=list)

    @field_validator("imageUrl", mode="before")
    @classmethod
    def _normalize_image_url(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            value = str(value)
        text = value.strip()
        return text or None

    @field_validator("imageUrls", mode="before")
    @classmethod
    def _normalize_image_urls(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            text = value.strip()
            return [text] if text else []
        if not isinstance(value, list):
            return []

        urls: list[str] = []
        for item in value:
            if item is None:
                continue
            text = str(item).strip()
            if text and text not in urls:
                urls.append(text)
        return urls

    @model_validator(mode="after")
    def _sync_image_url_fields(self):
        urls: list[str] = []
        if self.imageUrl:
            urls.append(self.imageUrl)
        for url in self.imageUrls:
            if url not in urls:
                urls.append(url)
        self.imageUrls = urls
        if self.imageUrl is None and urls:
            self.imageUrl = urls[0]
        return self

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_place_type(cls, value: Any) -> Any:
        if isinstance(value, PlaceType):
            return value
        if value is None:
            return PlaceType.OTHER

        normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "attraction": PlaceType.SCENIC,
            "attractions": PlaceType.SCENIC,
            "scenic": PlaceType.SCENIC,
            "scenic_spot": PlaceType.SCENIC,
            "sight": PlaceType.SCENIC,
            "sightseeing": PlaceType.SCENIC,
            "景点": PlaceType.SCENIC,
            "景区": PlaceType.SCENIC,
            "观光": PlaceType.SCENIC,
            "food": PlaceType.RESTAURANT,
            "restaurant": PlaceType.RESTAURANT,
            "restaurants": PlaceType.RESTAURANT,
            "dining": PlaceType.RESTAURANT,
            "meal": PlaceType.RESTAURANT,
            "餐厅": PlaceType.RESTAURANT,
            "美食": PlaceType.RESTAURANT,
            "小吃": PlaceType.RESTAURANT,
            "饭店": PlaceType.RESTAURANT,
            "hotel": PlaceType.HOTEL,
            "hotels": PlaceType.HOTEL,
            "accommodation": PlaceType.HOTEL,
            "酒店": PlaceType.HOTEL,
            "住宿": PlaceType.HOTEL,
            "transport": PlaceType.TRANSPORT,
            "transportation": PlaceType.TRANSPORT,
            "transit": PlaceType.TRANSPORT,
            "交通": PlaceType.TRANSPORT,
            "地铁": PlaceType.TRANSPORT,
            "机场": PlaceType.TRANSPORT,
            "车站": PlaceType.TRANSPORT,
            "shopping": PlaceType.SHOPPING,
            "shop": PlaceType.SHOPPING,
            "mall": PlaceType.SHOPPING,
            "购物": PlaceType.SHOPPING,
            "商场": PlaceType.SHOPPING,
            "activity": PlaceType.ACTIVITY,
            "activities": PlaceType.ACTIVITY,
            "experience": PlaceType.ACTIVITY,
            "活动": PlaceType.ACTIVITY,
            "体验": PlaceType.ACTIVITY,
        }
        if normalized in aliases:
            return aliases[normalized]

        upper = normalized.upper()
        if upper in PlaceType.__members__:
            return PlaceType[upper]
        return PlaceType.OTHER

    @field_validator("source", mode="before")
    @classmethod
    def _normalize_place_source(cls, value: Any) -> Any:
        if isinstance(value, PlaceSource):
            return value
        if value is None:
            return PlaceSource.AI

        normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "ai": PlaceSource.AI,
            "model": PlaceSource.AI,
            "llm": PlaceSource.AI,
            "amap": PlaceSource.AMAP,
            "gaode": PlaceSource.AMAP,
            "高德": PlaceSource.AMAP,
            "google": PlaceSource.GOOGLE,
            "google_maps": PlaceSource.GOOGLE,
            "internal": PlaceSource.INTERNAL_OFFER,
            "internal_offer": PlaceSource.INTERNAL_OFFER,
            "offer": PlaceSource.INTERNAL_OFFER,
            "offer_provider": PlaceSource.INTERNAL_OFFER,
        }
        if normalized in aliases:
            return aliases[normalized]

        upper = normalized.upper()
        if upper in PlaceSource.__members__:
            return PlaceSource[upper]
        return PlaceSource.AI


class PlannerRouteSegment(BaseModel):
    model_config = ConfigDict(extra="allow")

    fromPlaceId: UUID | None = None
    toPlaceId: UUID | None = None
    transportMode: str | None = None
    distanceKm: float | None = None
    estimatedMinutes: int | None = None
    polyline: str | None = None
    summary: str | None = None


class PlannerDayPlanStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    NEEDS_REVISION = "NEEDS_REVISION"


class PlannerDayPlanRef(BaseModel):
    model_config = ConfigDict(extra="allow")

    dayIndex: int = Field(ge=1)
    date: Date | None = None
    status: PlannerDayPlanStatus = PlannerDayPlanStatus.DRAFT
    title: str | None = None
    markdown: str = ""
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    changeSummary: str | None = None
    checksum: str | None = None


class PlannerSnapshotRef(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: int | None = None
    markdown: str | None = None
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    dayPlans: list[PlannerDayPlanRef] = Field(default_factory=list)
    currentDayIndex: int | None = Field(default=None, ge=1)
    completedDayIndexes: list[int] = Field(default_factory=list)


class PlannerSnapshotDraft(BaseModel):
    model_config = ConfigDict(extra="allow")

    baseVersion: int | None = None
    proposedVersion: int | None = None
    scope: PlanningScope | None = None
    targetDayIndex: int | None = Field(default=None, ge=1)
    currentDayPlan: PlannerDayPlanRef | None = None
    dayPlans: list[PlannerDayPlanRef] = Field(default_factory=list)
    markdown: str
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    changeSummary: str | None = None
    patchOps: list[dict[str, Any]] = Field(default_factory=list)
    checksum: str | None = None


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


class PlannerInteractionInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    selectedOptionIds: list[str] = Field(default_factory=list)
    rejectedOptionIds: list[str] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    freeText: str | None = None
    confirmCurrentPlan: bool = False


class PlannerOption(BaseModel):
    model_config = ConfigDict(extra="allow")

    optionId: str
    type: PlannerOptionType
    label: str
    description: str | None = None
    placeId: UUID | None = None
    value: dict[str, Any] = Field(default_factory=dict)
    selected: bool = False
    disabled: bool = False
    confidence: float | None = None
    impact: str | None = None


class PlannerOptionGroup(BaseModel):
    model_config = ConfigDict(extra="allow")

    groupId: str
    title: str
    mode: str = "MULTI_SELECT"
    minSelect: int = 0
    maxSelect: int | None = None
    options: list[PlannerOption] = Field(default_factory=list)


class AgentRunRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    conversationId: UUID
    userId: UUID
    planningMode: PlanningMode = PlanningMode.INITIAL_PLAN
    planningScope: PlanningScope = PlanningScope.DAY_PLAN
    modelVariant: PlannerModelVariant = PlannerModelVariant.FLASH
    targetDayIndex: int | None = Field(default=None, ge=1)
    targetDate: Date | None = None
    coreSlots: TripCoreSlots
    userMessage: str = ""
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    interaction: PlannerInteractionInput | None = None
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
    inputSummary: str | None = None
    outputSummary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class UserFacingEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str = "TOOL_STATUS"
    message: str
    status: str
    tool: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlannerStreamEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    eventId: str = Field(default_factory=lambda: str(uuid4()))
    traceId: str
    conversationId: str | None = None
    userId: str | None = None
    type: PlannerStreamEventType
    status: str
    message: str | None = None
    phase: str | None = None
    tool: str | None = None
    snapshotVersion: int | None = None
    targetDayIndex: int | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentRunResponse(BaseModel):
    traceId: str
    status: AgentStatus
    assistantText: str
    title: str
    summary: str | None = None
    markdown: str
    nextQuestion: str | None = None
    nextAction: PlannerNextAction = PlannerNextAction.ASK_USER_SELECTION
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    recommendationGroups: list[PlannerOptionGroup] = Field(default_factory=list)
    snapshotDraft: PlannerSnapshotDraft | None = None
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
