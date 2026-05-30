from __future__ import annotations

import hashlib
import asyncio
import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

from app.clients.deepseek_client import DeepSeekClient
from app.harness.hooks import after_agent_run, before_agent_run
from app.harness.policy import RuntimePolicy
from app.harness.tool_registry import ToolExecutionContext, ToolRegistry, ToolSpec
from app.harness.tool_result import ToolResult, ToolStatus
from app.harness.trace import TraceRecorder
from app.models import (
    AgentRunRequest,
    AgentRunResponse,
    AgentStatus,
    AgentWarning,
    PlannerDayPlanRef,
    PlannerDayPlanStatus,
    PlannerNextAction,
    PlannerOption,
    PlannerOptionGroup,
    PlannerOptionType,
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
    PlannerSnapshotDraft,
    PlannerStreamEvent,
    PlannerStreamEventType,
    PlanningScope,
    PlanningMode,
    PlaceType,
    PlaceSource,
    ToolCall,
    UserFacingEvent,
    model_dump_jsonable,
)
from app.services.fallback_plan_builder import FallbackPlanBuilder
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.amap_tool import AmapPoiTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.internal_offer_tool import InternalOfferTool
from app.tools.route_tool import RoutePlanTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool
from app.validation.planner_output import PlannerModelOutput


@dataclass
class AgentEvidence:
    places: list[PlannerPlaceSuggestion] = field(default_factory=list)
    hotels: list[PlannerPlaceSuggestion] = field(default_factory=list)
    weather: dict[str, Any] | None = None
    transport_options: list[dict[str, Any]] = field(default_factory=list)
    budget: dict[str, Any] | None = None
    routes: list[PlannerRouteSegment] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    observations: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class PlannerTurnState:
    base_snapshot_version: int | None = None
    selected_place_ids: set[UUID] = field(default_factory=set)
    rejected_place_ids: set[UUID] = field(default_factory=set)
    selected_option_ids: set[str] = field(default_factory=set)
    rejected_option_ids: set[str] = field(default_factory=set)
    selected_place_names: set[str] = field(default_factory=set)
    rejected_place_names: set[str] = field(default_factory=set)
    selected_styles: set[str] = field(default_factory=set)
    free_text: str | None = None
    confirm_current_plan: bool = False
    has_interaction: bool = False

    def has_constraints(self) -> bool:
        return bool(
            self.selected_place_ids
            or self.rejected_place_ids
            or self.selected_place_names
            or self.rejected_place_names
            or self.selected_styles
            or self.free_text
            or self.confirm_current_plan
        )


_NON_DEGRADING_WARNING_CODES = {"MOCK_DATA_USED"}


def _status_from_warnings(warnings: list[AgentWarning]) -> AgentStatus:
    if any(warning.code not in _NON_DEGRADING_WARNING_CODES for warning in warnings):
        return AgentStatus.PARTIAL_SUCCESS
    return AgentStatus.SUCCESS


class PlannerAgent:
    def __init__(
        self,
        deepseek_client: DeepSeekClient,
        amap_tool: AmapPoiTool,
        hotel_search_tool: HotelSearchTool,
        route_tool: RoutePlanTool,
        internal_offer_tool: InternalOfferTool,
        transport_search_tool: TransportSearchTool,
        weather_tool: WeatherTool,
        budget_tool: BudgetEstimateTool,
        fallback_builder: FallbackPlanBuilder,
        policy: RuntimePolicy,
    ) -> None:
        self._deepseek_client = deepseek_client
        self._amap_tool = amap_tool
        self._hotel_search_tool = hotel_search_tool
        self._route_tool = route_tool
        self._internal_offer_tool = internal_offer_tool
        self._transport_search_tool = transport_search_tool
        self._weather_tool = weather_tool
        self._budget_tool = budget_tool
        self._fallback_builder = fallback_builder
        self._policy = policy
        self._tool_registry = self._build_tool_registry(policy)

    async def run(
        self,
        request: AgentRunRequest,
        stream_event_sink: Callable[[PlannerStreamEvent], None] | None = None,
    ) -> AgentRunResponse:
        trace_id = str(uuid4())
        request_hash = self._request_hash(request)
        target_day_index = self._resolve_target_day_index(request)
        recorder = TraceRecorder(
            trace_id=trace_id,
            conversation_id=str(request.conversationId),
            user_id=str(request.userId),
            enabled=self._policy.trace_enabled,
            phase=request.planningMode.value,
            snapshot_version=request.latestSnapshot.version if request.latestSnapshot else None,
            request_hash=request_hash,
            target_day_index=target_day_index,
            stream_event_sink=stream_event_sink,
        )
        context = ToolExecutionContext(
            trace_id=trace_id,
            conversation_id=str(request.conversationId),
            user_id=str(request.userId),
            policy=self._policy,
            recorder=recorder,
            user_message=request.userMessage,
        )
        turn_state = self._load_turn_state(request)
        before_agent_run(recorder, "开始生成旅行规划。", phase="turn")

        missing = request.coreSlots.missing_required_slots()
        if missing:
            response = self._missing_slots_response(request, missing, trace_id, recorder.user_facing_events)
            after_agent_run(recorder, response.status.value, "缺少必要旅行信息，已返回补全提示。", phase="turn")
            response.userFacingEvents = recorder.user_facing_events
            return response

        if request.planningScope == PlanningScope.TRIP_ASSEMBLE:
            response = self._trip_assembly_response(request, trace_id, recorder, turn_state)
            after_agent_run(recorder, response.status.value, "最终行程汇总流程结束。", phase="turn")
            response.userFacingEvents = recorder.user_facing_events
            return response

        evidence = await self._run_react_loop(request, context)
        evidence.places = self._apply_user_interaction(request, evidence.places, turn_state)
        if not evidence.routes and request.latestSnapshot:
            evidence.routes = request.latestSnapshot.routes
        if turn_state.has_constraints():
            recorder.emit(
                event_type="USER_INTERACTION_APPLIED",
                name="planner_turn_state",
                status="SUCCESS",
                message="已应用本轮用户交互约束。",
                metadata=self._turn_state_trace_metadata(turn_state),
                phase="interaction",
            )
        tool_results = list(evidence.tool_results)
        warnings = []
        for result in tool_results:
            warnings.extend(self._warnings_from_tool(result))

        llm_result = await self._tool_registry.execute(
            "deepseek_chat_completion",
            context,
            request=request,
            places=[place.model_dump(mode="json", exclude_none=True) for place in evidence.places],
            weather=evidence.weather,
            transport_options=evidence.transport_options,
            budget=evidence.budget,
            react_observations=evidence.observations,
            planner_constraints=self._planner_constraints_payload(turn_state, request),
        )
        tool_results.append(llm_result)
        warnings.extend(self._warnings_from_tool(llm_result))

        if isinstance(llm_result.data, dict) and llm_result.succeeded:
            response = self._response_from_llm_payload(
                request=request,
                payload=llm_result.data,
                fallback_places=evidence.places,
                fallback_routes=evidence.routes,
                tool_results=tool_results,
                warnings=warnings,
                trace_id=trace_id,
                user_facing_events=recorder.user_facing_events,
                turn_state=turn_state,
            )
            after_agent_run(recorder, response.status.value, "旅行规划生成完成。", phase="turn")
            response.userFacingEvents = recorder.user_facing_events
            return response

        fallback_result = await self._tool_registry.execute(
            "fallback_plan_builder",
            context,
            allow_after_runtime_limit=True,
            request=request,
            places=evidence.places,
            weather=evidence.weather,
            transport_options=evidence.transport_options,
            budget=evidence.budget,
            routes=evidence.routes,
            planner_constraints=self._planner_constraints_payload(turn_state, request),
        )
        tool_results.append(fallback_result)
        warnings.extend(self._warnings_from_tool(fallback_result))
        recorder.emit(
            event_type="FALLBACK_USED",
            name="fallback_plan_builder",
            status=fallback_result.status.value,
            message="已使用本地兜底规划模板。",
            latency_ms=fallback_result.latencyMs,
            phase="fallback",
        )

        data = fallback_result.data if isinstance(fallback_result.data, dict) else {}
        places = self._places_from_unknown(data.get("places"))
        markdown = str(data.get("markdown") or "# 行前规划")
        routes = evidence.routes
        response = AgentRunResponse(
            traceId=trace_id,
            status=_status_from_warnings(warnings),
            assistantText=str(data.get("assistantText") or "我已生成一版结构化本地兜底行程。"),
            title=str(data.get("title") or f"{request.coreSlots.city or '目的地'}行前规划"),
            summary=str(data.get("summary")) if data.get("summary") else None,
            markdown=markdown,
            nextQuestion=str(data.get("nextQuestion")) if data.get("nextQuestion") else None,
            nextAction=self._next_action_for_request(request),
            places=places,
            routes=routes,
            recommendationGroups=self._build_recommendation_groups(request, places, turn_state),
            snapshotDraft=self._build_snapshot_draft(
                request=request,
                markdown=markdown,
                places=places,
                routes=routes,
                turn_state=turn_state,
                change_summary=self._change_summary(turn_state, "已生成本地兜底规划快照。"),
            ),
            toolCalls=self._tool_calls_from_results(tool_results),
            warnings=warnings,
            userFacingEvents=recorder.user_facing_events,
        )
        after_agent_run(recorder, response.status.value, "已返回基础旅行规划。", phase="turn")
        response.userFacingEvents = recorder.user_facing_events
        return response

    async def stream(self, request: AgentRunRequest) -> AsyncIterator[PlannerStreamEvent]:
        queue: asyncio.Queue[PlannerStreamEvent] = asyncio.Queue()
        last_trace_id: str | None = None

        def enqueue(event: PlannerStreamEvent) -> None:
            queue.put_nowait(event)

        run_task = asyncio.create_task(self.run(request, stream_event_sink=enqueue))

        try:
            while not run_task.done():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue
                last_trace_id = event.traceId
                yield event

            response = await run_task
            while not queue.empty():
                event = queue.get_nowait()
                last_trace_id = event.traceId
                yield event

            for event in self._terminal_stream_events(request, response):
                last_trace_id = event.traceId
                yield event
        except Exception as exc:  # pragma: no cover - defensive streaming boundary
            yield PlannerStreamEvent(
                traceId=last_trace_id or str(uuid4()),
                conversationId=str(request.conversationId),
                userId=str(request.userId),
                type=PlannerStreamEventType.RUN_FAILED,
                status=AgentStatus.FAILED.value,
                message="规划流式执行失败。",
                phase="turn",
                snapshotVersion=request.latestSnapshot.version if request.latestSnapshot else None,
                targetDayIndex=self._resolve_target_day_index(request),
                data={"error": str(exc)},
            )

    def _terminal_stream_events(
        self,
        request: AgentRunRequest,
        response: AgentRunResponse,
    ) -> list[PlannerStreamEvent]:
        events: list[PlannerStreamEvent] = []
        target_day_index = (
            response.snapshotDraft.targetDayIndex
            if response.snapshotDraft is not None
            else self._resolve_target_day_index(request)
        )
        base = {
            "traceId": response.traceId,
            "conversationId": str(request.conversationId),
            "userId": str(request.userId),
            "snapshotVersion": request.latestSnapshot.version if request.latestSnapshot else None,
            "targetDayIndex": target_day_index,
        }

        if response.recommendationGroups:
            events.append(
                PlannerStreamEvent(
                    **base,
                    type=PlannerStreamEventType.OPTIONS_READY,
                    status=response.status.value,
                    message="推荐选项已生成。",
                    phase="options",
                    data={
                        "recommendationGroups": [
                            group.model_dump(mode="json", exclude_none=True)
                            for group in response.recommendationGroups
                        ]
                    },
                )
            )

        if response.snapshotDraft is not None:
            events.append(
                PlannerStreamEvent(
                    **base,
                    type=PlannerStreamEventType.SNAPSHOT_DRAFT_READY,
                    status=response.status.value,
                    message="快照草稿已生成。",
                    phase="snapshot",
                    data={"snapshotDraft": response.snapshotDraft.model_dump(mode="json", exclude_none=True)},
                )
            )

        final_type = (
            PlannerStreamEventType.RUN_FAILED
            if response.status == AgentStatus.FAILED
            else PlannerStreamEventType.RUN_FINISHED
        )
        events.append(
            PlannerStreamEvent(
                **base,
                type=final_type,
                status=response.status.value,
                message="规划结果已完成。" if final_type == PlannerStreamEventType.RUN_FINISHED else "规划执行失败。",
                phase="turn",
                data={"response": response.model_dump(mode="json", exclude_none=True)},
            )
        )
        return events

    async def _run_react_loop(
        self,
        request: AgentRunRequest,
        context: ToolExecutionContext,
    ) -> AgentEvidence:
        evidence = AgentEvidence()
        max_steps = min(self._policy.max_react_steps, 3)
        evidence_tool_limit = max(min(self._policy.max_react_tool_calls, self._policy.max_tool_calls_per_turn - 1), 0)

        for step_index in range(max_steps):
            remaining = evidence_tool_limit - len(evidence.tool_results)
            if remaining <= 0:
                context.recorder.emit(
                    event_type="REACT_LIMIT_REACHED",
                    name="react_loop",
                    status="PARTIAL_SUCCESS",
                    message="证据工具调用已达上限，已为兜底规划保留执行空间。",
                    metadata={"maxEvidenceTools": evidence_tool_limit},
                    phase="react",
                )
                break

            tools = self._choose_tools_for_step(request, evidence, step_index)[:remaining]
            if not tools:
                break

            context.recorder.emit(
                event_type="REACT_STEP",
                name=f"react_step_{step_index + 1}",
                status="RUNNING",
                message="正在选择旅行证据工具。",
                metadata={"step": step_index + 1, "tools": tools},
                phase="react",
            )

            for tool_name in tools:
                result = await self._execute_react_tool(tool_name, request, context, evidence)
                evidence.tool_results.append(result)
                evidence.observations.append(self._observation_from_result(step_index + 1, result))
                self._apply_evidence_result(tool_name, result, evidence)

                if len(evidence.tool_results) >= evidence_tool_limit:
                    break

            if self._has_enough_evidence(request, evidence):
                context.recorder.emit(
                    event_type="REACT_STEP",
                    name=f"react_step_{step_index + 1}",
                    status="SUCCESS",
                    message="已收集足够的旅行规划证据。",
                    metadata={"step": step_index + 1, "toolsUsed": len(evidence.tool_results)},
                    phase="react",
                )
                break

        return evidence

    def _choose_tools_for_step(
        self,
        request: AgentRunRequest,
        evidence: AgentEvidence,
        step_index: int,
    ) -> list[str]:
        if step_index == 0:
            return [] if evidence.places else ["search_hotels"]
        if step_index == 1:
            return [] if evidence.weather else ["get_weather"]
        if step_index == 2:
            tools: list[str] = []
            if self._needs_transport(request) and not evidence.transport_options:
                tools.append("search_flights")
            if self._needs_budget(request) and evidence.budget is None:
                tools.append("estimate_budget")
            if not tools and evidence.places and not evidence.routes:
                tools.append("amap_route_plan")
            return tools
        return []

    async def _execute_react_tool(
        self,
        tool_name: str,
        request: AgentRunRequest,
        context: ToolExecutionContext,
        evidence: AgentEvidence,
    ) -> ToolResult:
        if tool_name == "search_hotels":
            return await self._tool_registry.execute("search_hotels", context, request=request)
        if tool_name == "get_weather":
            return await self._tool_registry.execute("get_weather", context, request=request)
        if tool_name == "search_flights":
            return await self._tool_registry.execute("search_flights", context, request=request)
        if tool_name == "estimate_budget":
            return await self._tool_registry.execute(
                "estimate_budget",
                context,
                request=request,
                hotels=evidence.hotels,
                transport_options=evidence.transport_options,
            )
        if tool_name == "amap_route_plan":
            return await self._tool_registry.execute(
                "amap_route_plan",
                context,
                places=evidence.places,
                day_count=request.coreSlots.day_count(),
            )
        if tool_name == "amap_poi_search":
            return await self._tool_registry.execute(
                "amap_poi_search",
                context,
                city=request.coreSlots.city or "",
                keywords=self._extract_keywords(request),
            )
        if tool_name == "internal_hotel_match":
            return await self._tool_registry.execute(
                "internal_hotel_match",
                context,
                places=evidence.places,
                hotels=evidence.hotels,
            )
        return ToolResult(
            tool=tool_name,
            status=ToolStatus.FAILED,
            errorCode="REACT_TOOL_NOT_SUPPORTED",
            errorMessage=f"不支持的 ReAct 工具：{tool_name}",
        )

    def _apply_evidence_result(
        self,
        tool_name: str,
        result: ToolResult,
        evidence: AgentEvidence,
    ) -> None:
        if tool_name == "search_hotels":
            evidence.hotels = self._places_from_result(result)
            evidence.places = self._merge_places(evidence.places, evidence.hotels)
            return
        if tool_name in {"amap_poi_search", "internal_hotel_match"}:
            evidence.places = self._merge_places(evidence.places, self._places_from_result(result, evidence.places))
            return
        if tool_name == "get_weather" and isinstance(result.data, dict):
            evidence.weather = result.data
            return
        if tool_name == "search_flights" and isinstance(result.data, list):
            evidence.transport_options = [item for item in result.data if isinstance(item, dict)]
            return
        if tool_name == "estimate_budget" and isinstance(result.data, dict):
            evidence.budget = result.data
            return
        if tool_name == "amap_route_plan":
            evidence.routes = self._routes_from_result(result)

    def _observation_from_result(self, step: int, result: ToolResult) -> dict[str, Any]:
        return {
            "step": step,
            "tool": result.tool,
            "status": result.status.value,
            "message": result.userMessage or result.errorMessage,
            "warnings": [warning.code for warning in result.warnings],
        }

    def _has_enough_evidence(self, request: AgentRunRequest, evidence: AgentEvidence) -> bool:
        has_places = bool(evidence.places)
        has_weather = evidence.weather is not None
        has_budget = evidence.budget is not None or not self._needs_budget(request)
        has_transport = bool(evidence.transport_options) or not self._needs_transport(request)
        return has_places and has_weather and has_budget and has_transport

    def _needs_transport(self, request: AgentRunRequest) -> bool:
        return True

    def _needs_budget(self, request: AgentRunRequest) -> bool:
        return True

    def _merge_places(
        self,
        existing: list[PlannerPlaceSuggestion],
        incoming: list[PlannerPlaceSuggestion],
    ) -> list[PlannerPlaceSuggestion]:
        merged = list(existing)
        seen: set[str] = set()
        for place in merged:
            seen.add(str(place.placeId) if place.placeId else place.name.lower())

        for place in incoming:
            key = str(place.placeId) if place.placeId else place.name.lower()
            if key in seen:
                continue
            merged.append(place)
            seen.add(key)
        return merged

    def _build_tool_registry(self, policy: RuntimePolicy) -> ToolRegistry:
        registry = ToolRegistry(policy)
        registry.register(
            ToolSpec(
                name="amap_poi_search",
                description="Search Amap POIs for travel places.",
                input_schema="city, keywords, limit",
                output_schema="list[PlannerPlaceSuggestion]",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=True,
                side_effect=False,
                user_running_message="正在查询地图点位...",
                user_success_message="地图点位查询完成。",
                user_failure_message="地图点位查询失败，已继续生成基础规划。",
            ),
            self._amap_tool.search_pois,
        )
        registry.register(
            ToolSpec(
                name="internal_hotel_match",
                description="Match places against internal offers.",
                input_schema="places, hotels",
                output_schema="list[PlannerPlaceSuggestion]",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=False,
                side_effect=False,
                user_running_message="正在匹配内部酒店和产品...",
                user_success_message="内部酒店匹配步骤已完成。",
                user_failure_message="内部酒店匹配失败，已保留泛酒店建议。",
            ),
            self._internal_offer_tool.match_hotels,
        )
        registry.register(
            ToolSpec(
                name="search_hotels",
                description="Search hotel candidates from offer-provider or mock data.",
                input_schema=AgentRunRequest,
                output_schema="list[PlannerPlaceSuggestion]",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=False,
                side_effect=False,
                user_running_message="正在查询酒店候选...",
                user_success_message="酒店候选查询完成。",
                user_failure_message="酒店候选查询失败，已继续生成基础规划。",
            ),
            self._hotel_search_tool.search_hotels,
        )
        registry.register(
            ToolSpec(
                name="get_weather",
                description="Get weather reference for travel dates.",
                input_schema=AgentRunRequest,
                output_schema="weather JSON",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=False,
                side_effect=False,
                user_running_message="正在查询出行天气...",
                user_success_message="出行天气查询完成。",
                user_failure_message="天气查询失败，已继续生成基础规划。",
            ),
            self._weather_tool.get_weather,
        )
        registry.register(
            ToolSpec(
                name="search_flights",
                description="Search flight or intercity transport candidates.",
                input_schema=AgentRunRequest,
                output_schema="list[transport option]",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=False,
                side_effect=False,
                user_running_message="正在查询往返交通候选...",
                user_success_message="往返交通候选查询完成。",
                user_failure_message="往返交通查询失败，已继续生成基础规划。",
            ),
            self._transport_search_tool.search_flights,
        )
        registry.register(
            ToolSpec(
                name="estimate_budget",
                description="Estimate trip budget with local rules.",
                input_schema=AgentRunRequest,
                output_schema="budget JSON",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=False,
                side_effect=False,
                user_running_message="正在估算旅行预算...",
                user_success_message="旅行预算估算完成。",
                user_failure_message="预算估算失败，已继续生成基础规划。",
            ),
            self._budget_tool.estimate_budget,
        )
        registry.register(
            ToolSpec(
                name="amap_route_plan",
                description="Plan route segments between places.",
                input_schema="places",
                output_schema="list[PlannerRouteSegment]",
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=True,
                side_effect=False,
                user_running_message="正在评估地点之间的路线...",
                user_success_message="路线评估步骤已完成。",
                user_failure_message="路线评估失败，已继续生成基础规划。",
            ),
            self._route_tool.plan_routes,
        )
        registry.register(
            ToolSpec(
                name="deepseek_chat_completion",
                description="Generate a structured itinerary with DeepSeek.",
                input_schema=AgentRunRequest,
                output_schema=PlannerModelOutput,
                timeout_seconds=policy.model_timeout_seconds,
                retry_count=0,
                requires_secret=True,
                side_effect=False,
                user_running_message="正在生成结构化旅行方案...",
                user_success_message="结构化旅行方案已生成。",
                user_failure_message="模型生成失败，已切换为本地规划模板。",
            ),
            self._deepseek_client.generate_plan,
        )
        registry.register(
            ToolSpec(
                name="fallback_plan_builder",
                description="Build a deterministic local fallback plan.",
                input_schema=AgentRunRequest,
                output_schema=PlannerModelOutput,
                timeout_seconds=policy.default_tool_timeout_seconds,
                retry_count=0,
                requires_secret=False,
                side_effect=False,
                user_running_message="正在生成基础行程草案...",
                user_success_message="基础行程草案已生成。",
                user_failure_message="基础行程草案生成失败。",
            ),
            self._fallback_builder.build_result,
        )
        return registry

    def list_tool_specs(self) -> list[ToolSpec]:
        return self._tool_registry.list_tools()

    def _request_hash(self, request: AgentRunRequest) -> str:
        payload = json.dumps(
            model_dump_jsonable(request),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _missing_slots_response(
        self,
        request: AgentRunRequest,
        missing: list[str],
        trace_id: str,
        user_facing_events: list[UserFacingEvent],
    ) -> AgentRunResponse:
        missing_text = "、".join(self._missing_slot_label(field) for field in missing)
        title = "缺少必要出行信息"
        markdown = (
            "# 缺少必要出行信息\n\n"
            f"请先补充：{missing_text}。\n\n"
            "开始规划前至少需要目的地、出行开始日期和出行人数。"
        )
        return AgentRunResponse(
            traceId=trace_id,
            status=AgentStatus.PARTIAL_SUCCESS,
            assistantText=f"开始规划前，请先补充：{missing_text}。",
            title=title,
            summary=f"缺少必要字段：{missing_text}",
            markdown=markdown,
            nextQuestion=f"请补充{missing_text}。",
            nextAction=PlannerNextAction.NEED_MORE_INFO,
            places=[],
            routes=[],
            recommendationGroups=[],
            snapshotDraft=None,
            toolCalls=[],
            warnings=[
                AgentWarning(
                    code="MISSING_REQUIRED_SLOTS",
                    message=f"缺少必要字段：{missing_text}",
                    source="agent",
                )
            ],
            userFacingEvents=user_facing_events,
        )

    def _missing_slot_label(self, field: str) -> str:
        return {
            "city": "目的地",
            "travelStartDate": "出行开始日期",
            "peopleCount": "出行人数",
        }.get(field, field)

    def _trip_assembly_response(
        self,
        request: AgentRunRequest,
        trace_id: str,
        recorder: TraceRecorder,
        turn_state: PlannerTurnState,
    ) -> AgentRunResponse:
        day_count = request.coreSlots.day_count()
        confirmed_day_plans = self._confirmed_day_plans(request)
        confirmed_day_indexes = {day_plan.dayIndex for day_plan in confirmed_day_plans}
        missing_day_indexes = [day_index for day_index in range(1, day_count + 1) if day_index not in confirmed_day_indexes]

        if missing_day_indexes:
            missing_text = "、".join(f"第 {day_index} 天" for day_index in missing_day_indexes)
            markdown = (
                "# 最终完整行程暂未就绪\n\n"
                f"请先确认以下日计划，再生成最终完整行程：{missing_text}。"
            )
            recorder.emit(
                event_type="TRIP_ASSEMBLY_BLOCKED",
                name="trip_assemble",
                status="PARTIAL_SUCCESS",
                message="还有未确认的日计划，暂不能生成最终完整行程。",
                metadata={
                    "totalDays": day_count,
                    "confirmedDayIndexes": sorted(confirmed_day_indexes),
                    "missingDayIndexes": missing_day_indexes,
                },
                phase="assemble",
            )
            recorder.append_user_event(
                UserFacingEvent(
                    type="AGENT_STATUS",
                    message=f"还有 {missing_text} 未确认，暂不能生成最终完整计划。",
                    status="PARTIAL_SUCCESS",
                    tool="trip_assemble",
                    metadata={"missingDayIndexes": missing_day_indexes},
                )
            )
            return AgentRunResponse(
                traceId=trace_id,
                status=AgentStatus.PARTIAL_SUCCESS,
                assistantText="还有部分日计划需要确认，暂不能生成最终完整行程。",
                title="最终完整行程暂未就绪",
                summary=f"未确认日期：{missing_text}",
                markdown=markdown,
                nextQuestion=f"请先确认{missing_text}。",
                nextAction=PlannerNextAction.ASK_USER_SELECTION,
                places=[],
                routes=[],
                recommendationGroups=[],
                snapshotDraft=None,
                toolCalls=[],
                warnings=[
                    AgentWarning(
                        code="TRIP_ASSEMBLY_NOT_READY",
                        message=f"未确认日计划：{missing_text}",
                        source="agent",
                    )
                ],
                userFacingEvents=recorder.user_facing_events,
            )

        places = self._aggregate_day_places(confirmed_day_plans)
        routes = self._aggregate_day_routes(confirmed_day_plans)
        markdown = self._build_final_trip_markdown(request, confirmed_day_plans, places, routes)
        title = f"{request.coreSlots.city or '目的地'}最终完整行程"
        summary = f"已将 {day_count} 个已确认日计划汇总为最终行程。"
        recorder.emit(
            event_type="TRIP_ASSEMBLY_COMPLETED",
            name="trip_assemble",
            status="SUCCESS",
            message="已将确认日计划汇总为最终完整行程。",
            metadata={
                "totalDays": day_count,
                "confirmedDayIndexes": sorted(confirmed_day_indexes),
                "placeCount": len(places),
                "routeCount": len(routes),
            },
            phase="assemble",
        )
        recorder.append_user_event(
            UserFacingEvent(
                type="AGENT_STATUS",
                message="已汇总所有已确认日计划，生成最终完整行程。",
                status="SUCCESS",
                tool="trip_assemble",
                metadata={"confirmedDayIndexes": sorted(confirmed_day_indexes)},
            )
        )
        return AgentRunResponse(
            traceId=trace_id,
            status=AgentStatus.SUCCESS,
            assistantText="我已将已确认的日计划汇总成最终完整行程。",
            title=title,
            summary=summary,
            markdown=markdown,
            nextQuestion=None,
            nextAction=PlannerNextAction.COMPLETE,
            places=places,
            routes=routes,
            recommendationGroups=[],
            snapshotDraft=self._build_snapshot_draft(
                request=request,
                markdown=markdown,
                places=places,
                routes=routes,
                turn_state=turn_state,
                change_summary="已将确认日计划汇总为最终行程快照。",
            ),
            toolCalls=[],
            warnings=[],
            userFacingEvents=recorder.user_facing_events,
        )

    def _confirmed_day_plans(self, request: AgentRunRequest) -> list[PlannerDayPlanRef]:
        day_plans = request.latestSnapshot.dayPlans if request.latestSnapshot else []
        confirmed = [day_plan for day_plan in day_plans if day_plan.status == PlannerDayPlanStatus.CONFIRMED]
        return sorted(confirmed, key=lambda day_plan: day_plan.dayIndex)

    def _aggregate_day_places(self, day_plans: list[PlannerDayPlanRef]) -> list[PlannerPlaceSuggestion]:
        places_by_key: dict[str, tuple[PlannerPlaceSuggestion, set[int]]] = {}
        for day_plan in day_plans:
            for place in day_plan.places:
                key = self._place_identity(place)
                if key not in places_by_key:
                    places_by_key[key] = (place, {day_plan.dayIndex})
                    continue
                existing, day_indexes = places_by_key[key]
                day_indexes.add(day_plan.dayIndex)
                places_by_key[key] = (existing, day_indexes)

        aggregated: list[PlannerPlaceSuggestion] = []
        for place, day_indexes in places_by_key.values():
            aggregated.append(place.model_copy(update={"dayIndexes": sorted(day_indexes)}))
        return aggregated

    def _aggregate_day_routes(self, day_plans: list[PlannerDayPlanRef]) -> list[PlannerRouteSegment]:
        routes: list[PlannerRouteSegment] = []
        for day_plan in day_plans:
            routes.extend(route.model_copy(update={"dayIndex": day_plan.dayIndex}) for route in day_plan.routes)
        return routes

    def _build_final_trip_markdown(
        self,
        request: AgentRunRequest,
        day_plans: list[PlannerDayPlanRef],
        places: list[PlannerPlaceSuggestion],
        routes: list[PlannerRouteSegment],
    ) -> str:
        slots = request.coreSlots
        city = slots.city or "目的地"
        start = slots.travelStartDate.isoformat() if slots.travelStartDate else "未知开始日期"
        end = (slots.travelEndDate or slots.travelStartDate).isoformat() if slots.travelStartDate else "未知结束日期"
        lines = [
            f"# {city}最终完整行程",
            "",
            "## 行程概览",
            "",
            f"- 日期：{start} 至 {end}",
            f"- 出行人数：{slots.peopleCount or '未填写'}",
            f"- 已确认天数：{len(day_plans)}",
            "",
            "## 每日安排",
            "",
        ]

        for day_plan in day_plans:
            date_text = f" ({day_plan.date.isoformat()})" if day_plan.date else ""
            lines.extend([f"### 第 {day_plan.dayIndex} 天{date_text}", ""])
            body = self._strip_top_heading(day_plan.markdown)
            if body:
                lines.extend([body, ""])
            else:
                lines.extend(["- 该日计划已确认，但暂缺详细 Markdown。", ""])

        if places:
            lines.extend(["## 分日地图点位", ""])
            for place in places:
                day_indexes = getattr(place, "dayIndexes", None)
                day_text = "、".join(f"第 {day_index} 天" for day_index in day_indexes) if day_indexes else "计划日"
                description = f" - {place.description}" if place.description else ""
                lines.append(f"- {day_text}: {place.name}{description}")
            lines.append("")

        if routes:
            lines.extend(["## 路线备注", ""])
            for route in routes:
                day_index = getattr(route, "dayIndex", None)
                prefix = f"第 {day_index} 天：" if day_index else ""
                summary = route.summary or "已有路线估算。"
                lines.append(f"- {prefix}{summary}")
            lines.append("")

        lines.extend(
            [
                "## 确认说明",
                "",
                "- 本最终行程只汇总已确认的日计划。",
                "- 预订、支付和实时库存仍需由 Java 侧业务服务完成。",
            ]
        )
        return "\n".join(lines).strip()

    def _strip_top_heading(self, markdown: str) -> str:
        lines = markdown.splitlines()
        if lines and lines[0].lstrip().startswith("#"):
            lines = lines[1:]
            while lines and not lines[0].strip():
                lines = lines[1:]
        return "\n".join(lines).strip()

    def _place_identity(self, place: PlannerPlaceSuggestion) -> str:
        if place.placeId:
            return str(place.placeId)
        if place.internalOfferId:
            return f"internal:{place.internalOfferId}"
        if place.amapPoiId:
            return f"amap:{place.amapPoiId}"
        return f"name:{self._normalize_place_name(place.name)}"

    def _extract_keywords(self, request: AgentRunRequest) -> list[str]:
        keywords: list[str] = []
        keywords.extend([keyword.strip() for keyword in request.coreSlots.mustVisitKeywords if keyword.strip()])

        message = request.userMessage.strip()
        if message:
            for separator in [",", "，", ";", "；", "、"]:
                message = message.replace(separator, " ")
            for token in message.split():
                cleaned = token.strip()
                if 1 < len(cleaned) <= 20 and cleaned not in keywords:
                    keywords.append(cleaned)

        if request.coreSlots.travelStyle and request.coreSlots.travelStyle not in keywords:
            keywords.append(request.coreSlots.travelStyle)

        if not keywords:
            keywords = ["景点", "博物馆", "餐厅"]

        avoid = {keyword.lower() for keyword in request.coreSlots.avoidKeywords}
        return [keyword for keyword in keywords[:8] if keyword.lower() not in avoid]

    def _response_from_llm_payload(
        self,
        request: AgentRunRequest,
        payload: dict,
        fallback_places: list[PlannerPlaceSuggestion],
        fallback_routes: list[PlannerRouteSegment],
        tool_results: list[ToolResult],
        warnings: list[AgentWarning],
        trace_id: str,
        user_facing_events: list[UserFacingEvent],
        turn_state: PlannerTurnState,
    ) -> AgentRunResponse:
        places = self._parse_places(payload.get("places"), fallback_places, turn_state)
        routes = self._parse_routes(payload.get("routes"), fallback_routes)
        markdown = str(payload.get("markdown") or "").strip()
        title = str(payload.get("title") or "").strip() or f"{request.coreSlots.city or '目的地'}行前规划"
        summary = str(payload.get("summary") or "").strip() or None
        assistant_text = str(payload.get("assistantText") or "").strip() or "我已生成一版更新后的旅行规划。"
        next_question = str(payload.get("nextQuestion") or "").strip() or None
        places = self._apply_user_interaction(request, places, turn_state)

        if not markdown:
            assistant_text, title, summary, markdown, places = self._fallback_builder.build(request, places, routes=routes)
            warnings.append(
                AgentWarning(
                    code="MODEL_MARKDOWN_EMPTY",
                    message="模型响应缺少 Markdown，已使用本地兜底 Markdown。",
                    source="agent",
                )
            )

        return AgentRunResponse(
            traceId=trace_id,
            status=_status_from_warnings(warnings),
            assistantText=assistant_text,
            title=title,
            summary=summary,
            markdown=markdown,
            nextQuestion=next_question,
            nextAction=self._next_action_for_request(request),
            places=places,
            routes=routes,
            recommendationGroups=self._build_recommendation_groups(request, places, turn_state),
            snapshotDraft=self._build_snapshot_draft(
                request=request,
                markdown=markdown,
                places=places,
                routes=routes,
                turn_state=turn_state,
                change_summary=self._change_summary(turn_state, "已生成更新后的规划快照。"),
            ),
            toolCalls=self._tool_calls_from_results(tool_results),
            warnings=warnings,
            userFacingEvents=user_facing_events,
        )

    def _next_action_for_request(self, request: AgentRunRequest) -> PlannerNextAction:
        if request.interaction and request.interaction.confirmCurrentPlan:
            return PlannerNextAction.COMPLETE
        if request.planningMode == PlanningMode.FINALIZE_PLAN:
            return PlannerNextAction.COMPLETE
        if request.planningMode == PlanningMode.REFINE_WITH_SELECTION:
            return PlannerNextAction.PLAN_UPDATED
        return PlannerNextAction.ASK_USER_SELECTION

    def _load_turn_state(self, request: AgentRunRequest) -> PlannerTurnState:
        selected_place_ids = set(request.selectedPlaceIds)
        rejected_place_ids: set[UUID] = set()
        selected_option_ids: set[str] = set()
        rejected_option_ids: set[str] = set()
        selected_place_names: set[str] = set()
        rejected_place_names: set[str] = set()
        selected_styles: set[str] = set()
        free_text: str | None = None
        confirm_current_plan = False
        has_interaction = request.planningMode != PlanningMode.INITIAL_PLAN

        interaction = request.interaction
        if interaction:
            has_interaction = True
            selected_place_ids.update(interaction.selectedPlaceIds)
            rejected_place_ids.update(interaction.rejectedPlaceIds)
            selected_option_ids.update(option for option in interaction.selectedOptionIds if option)
            rejected_option_ids.update(option for option in interaction.rejectedOptionIds if option)
            free_text = interaction.freeText.strip() if interaction.freeText and interaction.freeText.strip() else None
            confirm_current_plan = interaction.confirmCurrentPlan

        for option_id in selected_option_ids:
            self._apply_option_id_to_state(
                option_id=option_id,
                place_ids=selected_place_ids,
                place_names=selected_place_names,
                styles=selected_styles,
            )
            if option_id in {"finalize:confirm_current_plan", "day:confirm_current_day"}:
                confirm_current_plan = True

        for option_id in rejected_option_ids:
            self._apply_option_id_to_state(
                option_id=option_id,
                place_ids=rejected_place_ids,
                place_names=rejected_place_names,
                styles=set(),
            )

        return PlannerTurnState(
            base_snapshot_version=request.latestSnapshot.version if request.latestSnapshot else None,
            selected_place_ids=selected_place_ids,
            rejected_place_ids=rejected_place_ids,
            selected_option_ids=selected_option_ids,
            rejected_option_ids=rejected_option_ids,
            selected_place_names=selected_place_names,
            rejected_place_names=rejected_place_names,
            selected_styles=selected_styles,
            free_text=free_text,
            confirm_current_plan=confirm_current_plan,
            has_interaction=has_interaction,
        )

    def _apply_option_id_to_state(
        self,
        *,
        option_id: str,
        place_ids: set[UUID],
        place_names: set[str],
        styles: set[str],
    ) -> None:
        if option_id.startswith("place:name:"):
            place_names.add(self._normalize_place_name(option_id.removeprefix("place:name:")))
            return
        if option_id.startswith("place:"):
            raw_id = option_id.removeprefix("place:")
            try:
                place_ids.add(UUID(raw_id))
                return
            except ValueError:
                place_names.add(self._normalize_place_name(raw_id))
                return
        if option_id.startswith("style:"):
            styles.add(option_id.removeprefix("style:").strip().lower())

    def _apply_user_interaction(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
        turn_state: PlannerTurnState,
    ) -> list[PlannerPlaceSuggestion]:
        merged = self._merge_places(request.latestSnapshot.places if request.latestSnapshot else [], places)
        if not turn_state.has_constraints():
            return merged

        applied: list[PlannerPlaceSuggestion] = []
        for place in merged:
            normalized_name = self._normalize_place_name(place.name)
            rejected = bool(
                (place.placeId and place.placeId in turn_state.rejected_place_ids)
                or normalized_name in turn_state.rejected_place_names
            )
            if rejected:
                continue

            selected = bool(
                place.selected
                or (place.placeId and place.placeId in turn_state.selected_place_ids)
                or normalized_name in turn_state.selected_place_names
            )
            applied.append(place.model_copy(update={"selected": selected}))
        return applied

    def _planner_constraints_payload(self, turn_state: PlannerTurnState, request: AgentRunRequest | None = None) -> dict[str, Any]:
        target_day_index = self._resolve_target_day_index(request) if request is not None else None
        return {
            "baseSnapshotVersion": turn_state.base_snapshot_version,
            "planningScope": request.planningScope.value if request is not None else None,
            "targetDayIndex": target_day_index,
            "selectedPlaceIds": [str(place_id) for place_id in sorted(turn_state.selected_place_ids, key=str)],
            "rejectedPlaceIds": [str(place_id) for place_id in sorted(turn_state.rejected_place_ids, key=str)],
            "selectedOptionIds": sorted(turn_state.selected_option_ids),
            "rejectedOptionIds": sorted(turn_state.rejected_option_ids),
            "selectedPlaceNames": sorted(turn_state.selected_place_names),
            "rejectedPlaceNames": sorted(turn_state.rejected_place_names),
            "selectedStyles": sorted(turn_state.selected_styles),
            "freeText": turn_state.free_text,
            "confirmCurrentPlan": turn_state.confirm_current_plan,
            "rules": [
                "Must keep selected places unless impossible.",
                "Must not include rejected places as primary recommendations.",
                "Use selected style options as planning constraints.",
                "Use freeText as the latest user revision request.",
                "When planningScope is DAY_PLAN or DAY_REFINE, generate only the target day.",
            ],
        }

    def _turn_state_trace_metadata(self, turn_state: PlannerTurnState) -> dict[str, Any]:
        return {
            "baseSnapshotVersion": turn_state.base_snapshot_version,
            "selectedPlaceCount": len(turn_state.selected_place_ids) + len(turn_state.selected_place_names),
            "rejectedPlaceCount": len(turn_state.rejected_place_ids) + len(turn_state.rejected_place_names),
            "selectedStyleCount": len(turn_state.selected_styles),
            "hasFreeText": bool(turn_state.free_text),
            "confirmCurrentPlan": turn_state.confirm_current_plan,
        }

    def _build_recommendation_groups(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
        turn_state: PlannerTurnState,
    ) -> list[PlannerOptionGroup]:
        if turn_state.confirm_current_plan:
            return []

        place_options: list[PlannerOption] = []

        for place in places[:8]:
            normalized_name = self._normalize_place_name(place.name)
            if (place.placeId and place.placeId in turn_state.rejected_place_ids) or (
                normalized_name in turn_state.rejected_place_names
            ):
                continue
            option_type = PlannerOptionType.HOTEL if place.type == PlaceType.HOTEL else PlannerOptionType.PLACE
            place_options.append(
                PlannerOption(
                    optionId=self._place_option_id(place),
                    type=option_type,
                    label=place.name,
                    description=place.description or place.address,
                    placeId=place.placeId,
                    value={
                        "placeType": place.type.value,
                        "source": place.source.value,
                        "internalOfferId": str(place.internalOfferId) if place.internalOfferId else None,
                        "amapPoiId": place.amapPoiId,
                    },
                    selected=bool(
                        place.selected
                        or (place.placeId and place.placeId in turn_state.selected_place_ids)
                        or normalized_name in turn_state.selected_place_names
                    ),
                    confidence=0.74 if place.source == PlaceSource.AI else 0.82,
                    impact=self._place_option_impact(place),
                )
            )

        groups: list[PlannerOptionGroup] = []
        if place_options:
            groups.append(
                PlannerOptionGroup(
                    groupId="recommended_places",
                    title="选择要保留在规划中的地点",
                    mode="MULTI_SELECT",
                    minSelect=0,
                    maxSelect=min(4, len(place_options)),
                    options=place_options,
                )
            )

        style_options = self._style_options(turn_state)
        if style_options:
            groups.append(
                PlannerOptionGroup(
                    groupId="planning_style",
                    title="选择下一版规划风格",
                    mode="SINGLE_SELECT",
                    minSelect=0,
                    maxSelect=1,
                    options=style_options,
                )
            )

        day_action_options = self._day_action_options(request, turn_state)
        if day_action_options:
            groups.append(
                PlannerOptionGroup(
                    groupId="day_plan_actions",
                    title="选择下一步日计划动作",
                    mode="SINGLE_SELECT",
                    minSelect=0,
                    maxSelect=1,
                    options=day_action_options,
                )
            )

        groups.append(
            PlannerOptionGroup(
                groupId="finalize_plan",
                title="规划确认",
                mode="SINGLE_SELECT",
                minSelect=0,
                maxSelect=1,
                options=[
                    PlannerOption(
                        optionId="finalize:confirm_current_plan",
                        type=PlannerOptionType.FINALIZE,
                        label="确认当前规划",
                        description="将当前 Markdown 和地图点位作为要保存的正式版本。",
                        value={"confirmCurrentPlan": True},
                        selected=False,
                        confidence=1.0,
                        impact="除非用户继续提出修改，否则不需要再由 Agent 重写。",
                    )
                ],
            )
        )
        return groups

    def _day_action_options(self, request: AgentRunRequest, turn_state: PlannerTurnState) -> list[PlannerOption]:
        if request.planningScope not in {PlanningScope.DAY_PLAN, PlanningScope.DAY_REFINE}:
            return []

        target_day_index = self._resolve_target_day_index(request) or 1
        total_days = request.coreSlots.day_count()
        next_day_index = target_day_index + 1
        return [
            PlannerOption(
                optionId="day:confirm_current_day",
                type=PlannerOptionType.DAY_ACTION,
                label=f"确认第 {target_day_index} 天",
                description="将当天草案保存为已确认，并作为下一天规划的上下文。",
                value={
                    "confirmCurrentPlan": True,
                    "targetDayIndex": target_day_index,
                    "nextPlanningScope": "DAY_PLAN",
                    "nextTargetDayIndex": next_day_index if next_day_index <= total_days else None,
                },
                selected=turn_state.confirm_current_plan,
                confidence=1.0,
                impact="下一轮规划会进入下一个未确认的日期。",
            ),
            PlannerOption(
                optionId="day:rewrite_current_day",
                type=PlannerOptionType.DAY_ACTION,
                label=f"重写第 {target_day_index} 天",
                description="结合用户补充反馈，继续修订当天计划。",
                value={
                    "planningScope": "DAY_REFINE",
                    "targetDayIndex": target_day_index,
                },
                selected=False,
                confidence=0.9,
                impact="下一轮会保持当前目标日期，并应用用户补充说明。",
            ),
            PlannerOption(
                optionId="day:next_day",
                type=PlannerOptionType.DAY_ACTION,
                label="继续下一天",
                description="基于已确认的前序日计划，生成下一天规划。",
                value={
                    "planningScope": "DAY_PLAN",
                    "targetDayIndex": next_day_index if next_day_index <= total_days else None,
                },
                selected=False,
                disabled=next_day_index > total_days,
                confidence=0.85,
                impact=(
                    f"下一轮将生成第 {next_day_index} 天。"
                    if next_day_index <= total_days
                    else "所有计划出行日期都已有草案。"
                ),
            ),
        ]

    def _style_options(self, turn_state: PlannerTurnState) -> list[PlannerOption]:
        selected_option_ids = turn_state.selected_option_ids
        styles = [
            (
                "style:relaxed",
                "更轻松",
                "减少步行距离，预留更多缓冲时间。",
                "下一版会减少每天地点数量，并增加休息时间。",
            ),
            (
                "style:efficient",
                "更高效",
                "把相邻地点合并安排，减少折返。",
                "下一版会优化路线密度和地点分组。",
            ),
            (
                "style:food_focused",
                "偏重美食",
                "增加餐厅和本地美食建议。",
                "下一版会为用餐和美食停留预留更多时间。",
            ),
        ]
        return [
            PlannerOption(
                optionId=option_id,
                type=PlannerOptionType.STYLE,
                label=label,
                description=description,
                value={"style": option_id.split(":", 1)[1]},
                selected=option_id in selected_option_ids,
                disabled=option_id in turn_state.rejected_option_ids,
                confidence=0.7,
                impact=impact,
            )
            for option_id, label, description, impact in styles
        ]

    def _build_snapshot_draft(
        self,
        *,
        request: AgentRunRequest,
        markdown: str,
        places: list[PlannerPlaceSuggestion],
        routes: list[PlannerRouteSegment],
        turn_state: PlannerTurnState,
        change_summary: str,
    ) -> PlannerSnapshotDraft:
        base_version = turn_state.base_snapshot_version
        selected_place_ids = sorted(turn_state.selected_place_ids, key=str)
        rejected_place_ids = sorted(turn_state.rejected_place_ids, key=str)
        target_day_index = self._resolve_target_day_index(request)
        current_day_plan = self._build_current_day_plan(
            request=request,
            target_day_index=target_day_index,
            markdown=markdown,
            places=places,
            routes=routes,
            selected_place_ids=selected_place_ids,
            rejected_place_ids=rejected_place_ids,
            change_summary=change_summary,
            turn_state=turn_state,
        )
        day_plans = self._merge_day_plans(
            request.latestSnapshot.dayPlans if request.latestSnapshot else [],
            current_day_plan,
        )
        patch_ops = self._snapshot_patch_ops(request, markdown, places, routes, turn_state)
        checksum = self._snapshot_checksum(
            markdown,
            places,
            routes,
            selected_place_ids,
            rejected_place_ids,
            scope=request.planningScope,
            target_day_index=target_day_index,
            day_plans=day_plans,
        )

        return PlannerSnapshotDraft(
            baseVersion=base_version,
            proposedVersion=(base_version + 1) if base_version is not None else 1,
            scope=request.planningScope,
            targetDayIndex=target_day_index,
            currentDayPlan=current_day_plan,
            dayPlans=day_plans,
            markdown=markdown,
            places=places,
            routes=routes,
            selectedPlaceIds=selected_place_ids,
            rejectedPlaceIds=rejected_place_ids,
            changeSummary=change_summary,
            patchOps=patch_ops,
            checksum=checksum,
        )

    def _resolve_target_day_index(self, request: AgentRunRequest) -> int | None:
        if request.targetDayIndex is not None:
            return request.targetDayIndex
        if request.planningScope == PlanningScope.TRIP_ASSEMBLE:
            return None

        snapshot = request.latestSnapshot
        if snapshot and snapshot.currentDayIndex is not None:
            return snapshot.currentDayIndex

        day_count = request.coreSlots.day_count()
        if not snapshot or not snapshot.dayPlans:
            return 1

        completed = set(snapshot.completedDayIndexes)
        completed.update(day.dayIndex for day in snapshot.dayPlans if day.status == PlannerDayPlanStatus.CONFIRMED)
        for day_index in range(1, day_count + 1):
            if day_index not in completed:
                return day_index
        return day_count

    def _resolve_target_date(self, request: AgentRunRequest, target_day_index: int | None):
        if request.targetDate is not None:
            return request.targetDate
        if target_day_index is None or request.coreSlots.travelStartDate is None:
            return None
        return request.coreSlots.travelStartDate + timedelta(days=target_day_index - 1)

    def _build_current_day_plan(
        self,
        *,
        request: AgentRunRequest,
        target_day_index: int | None,
        markdown: str,
        places: list[PlannerPlaceSuggestion],
        routes: list[PlannerRouteSegment],
        selected_place_ids: list[UUID],
        rejected_place_ids: list[UUID],
        change_summary: str,
        turn_state: PlannerTurnState,
    ) -> PlannerDayPlanRef | None:
        if target_day_index is None:
            return None

        status = PlannerDayPlanStatus.CONFIRMED if turn_state.confirm_current_plan else PlannerDayPlanStatus.DRAFT
        checksum = self._day_plan_checksum(
            scope=request.planningScope,
            target_day_index=target_day_index,
            markdown=markdown,
            places=places,
            routes=routes,
            selected_place_ids=selected_place_ids,
            rejected_place_ids=rejected_place_ids,
        )
        return PlannerDayPlanRef(
            dayIndex=target_day_index,
            date=self._resolve_target_date(request, target_day_index),
            status=status,
            title=self._day_plan_title(markdown, request, target_day_index),
            markdown=markdown,
            places=places,
            routes=routes,
            selectedPlaceIds=selected_place_ids,
            rejectedPlaceIds=rejected_place_ids,
            changeSummary=change_summary,
            checksum=checksum,
        )

    def _merge_day_plans(
        self,
        existing_day_plans: list[PlannerDayPlanRef],
        current_day_plan: PlannerDayPlanRef | None,
    ) -> list[PlannerDayPlanRef]:
        merged_by_day = {day_plan.dayIndex: day_plan for day_plan in existing_day_plans}
        if current_day_plan is not None:
            merged_by_day[current_day_plan.dayIndex] = current_day_plan
        return [merged_by_day[day_index] for day_index in sorted(merged_by_day)]

    def _day_plan_title(self, markdown: str, request: AgentRunRequest, target_day_index: int) -> str:
        for line in markdown.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                return stripped.lstrip("#").strip() or f"第 {target_day_index} 天"
        city = request.coreSlots.city or "目的地"
        return f"{city}第 {target_day_index} 天"

    def _day_plan_checksum(
        self,
        *,
        scope: PlanningScope,
        target_day_index: int,
        markdown: str,
        places: list[PlannerPlaceSuggestion],
        routes: list[PlannerRouteSegment],
        selected_place_ids: list[UUID],
        rejected_place_ids: list[UUID],
    ) -> str:
        payload = {
            "scope": scope.value,
            "targetDayIndex": target_day_index,
            "markdown": markdown,
            "places": [place.model_dump(mode="json", exclude_none=True) for place in places],
            "routes": [route.model_dump(mode="json", exclude_none=True) for route in routes],
            "selectedPlaceIds": [str(place_id) for place_id in selected_place_ids],
            "rejectedPlaceIds": [str(place_id) for place_id in rejected_place_ids],
        }
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _snapshot_patch_ops(
        self,
        request: AgentRunRequest,
        markdown: str,
        places: list[PlannerPlaceSuggestion],
        routes: list[PlannerRouteSegment],
        turn_state: PlannerTurnState,
    ) -> list[dict[str, Any]]:
        base = request.latestSnapshot
        target_day_index = self._resolve_target_day_index(request)
        ops: list[dict[str, Any]] = []
        if base is None:
            initial_ops = [
                {"op": "add", "path": "/markdown", "summary": "已创建初版规划 Markdown。"},
                {"op": "add", "path": "/places", "summary": f"已添加 {len(places)} 个规划地点。"},
                {"op": "add", "path": "/routes", "summary": f"已添加 {len(routes)} 段路线。"},
            ]
            if target_day_index is not None:
                initial_ops.append(
                    {
                        "op": "add",
                        "path": f"/dayPlans/{target_day_index}",
                        "summary": f"已创建第 {target_day_index} 天规划草案。",
                    }
                )
            return initial_ops

        if (base.markdown or "") != markdown:
            ops.append({"op": "replace", "path": "/markdown", "summary": "已更新规划 Markdown。"})
        if len(base.places) != len(places):
            ops.append(
                {
                    "op": "replace",
                    "path": "/places",
                    "summary": f"地点数量已从 {len(base.places)} 个更新为 {len(places)} 个。",
                }
            )
        if len(base.routes) != len(routes):
            ops.append(
                {
                    "op": "replace",
                    "path": "/routes",
                    "summary": f"路线数量已从 {len(base.routes)} 段更新为 {len(routes)} 段。",
                }
            )
        if target_day_index is not None:
            matching_day = next((day_plan for day_plan in base.dayPlans if day_plan.dayIndex == target_day_index), None)
            op = "replace" if matching_day else "add"
            ops.append(
                {
                    "op": op,
                    "path": f"/dayPlans/{target_day_index}",
                    "summary": f"已{'更新' if matching_day else '创建'}第 {target_day_index} 天规划草案。",
                }
            )
        if turn_state.selected_place_ids:
            ops.append(
                {
                    "op": "apply",
                    "path": "/interaction/selectedPlaceIds",
                    "summary": "已应用用户选择的地点约束。",
                    "value": [str(place_id) for place_id in sorted(turn_state.selected_place_ids, key=str)],
                }
            )
        if turn_state.rejected_place_ids:
            ops.append(
                {
                    "op": "apply",
                    "path": "/interaction/rejectedPlaceIds",
                    "summary": "已应用用户拒绝的地点约束。",
                    "value": [str(place_id) for place_id in sorted(turn_state.rejected_place_ids, key=str)],
                }
            )
        if turn_state.selected_option_ids:
            ops.append(
                {
                    "op": "apply",
                    "path": "/interaction/selectedOptionIds",
                    "summary": "已应用用户选择的推荐选项。",
                    "value": sorted(turn_state.selected_option_ids),
                }
            )
        if turn_state.rejected_option_ids:
            ops.append(
                {
                    "op": "apply",
                    "path": "/interaction/rejectedOptionIds",
                    "summary": "已应用用户拒绝的推荐选项。",
                    "value": sorted(turn_state.rejected_option_ids),
                }
            )
        if turn_state.free_text:
            ops.append(
                {
                    "op": "apply",
                    "path": "/interaction/freeText",
                    "summary": "已应用用户自由文本修订要求。",
                    "value": turn_state.free_text,
                }
            )
        return ops or [{"op": "test", "path": "/", "summary": "未检测到实质性规划变化。"}]

    def _snapshot_checksum(
        self,
        markdown: str,
        places: list[PlannerPlaceSuggestion],
        routes: list[PlannerRouteSegment],
        selected_place_ids: list[UUID],
        rejected_place_ids: list[UUID],
        *,
        scope: PlanningScope | None = None,
        target_day_index: int | None = None,
        day_plans: list[PlannerDayPlanRef] | None = None,
    ) -> str:
        payload = {
            "scope": scope.value if scope else None,
            "targetDayIndex": target_day_index,
            "markdown": markdown,
            "places": [place.model_dump(mode="json", exclude_none=True) for place in places],
            "routes": [route.model_dump(mode="json", exclude_none=True) for route in routes],
            "dayPlans": [
                day_plan.model_dump(mode="json", exclude_none=True)
                for day_plan in (day_plans or [])
            ],
            "selectedPlaceIds": [str(place_id) for place_id in selected_place_ids],
            "rejectedPlaceIds": [str(place_id) for place_id in rejected_place_ids],
        }
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _place_option_id(self, place: PlannerPlaceSuggestion) -> str:
        if place.placeId:
            return f"place:{place.placeId}"
        return f"place:name:{place.name.strip().lower().replace(' ', '-')}"

    def _normalize_place_name(self, name: str) -> str:
        return " ".join(name.strip().lower().replace("-", " ").split())

    def _change_summary(self, turn_state: PlannerTurnState, default: str) -> str:
        if not turn_state.has_constraints():
            return default

        parts = [default]
        if turn_state.base_snapshot_version is not None:
            parts.append(f"基于快照版本 {turn_state.base_snapshot_version}。")
        if turn_state.selected_place_ids or turn_state.selected_place_names:
            parts.append("已保留用户选择的地点约束。")
        if turn_state.rejected_place_ids or turn_state.rejected_place_names:
            parts.append("已移除用户拒绝的地点约束。")
        if turn_state.selected_styles:
            styles = ", ".join(sorted(turn_state.selected_styles))
            parts.append(f"已应用风格偏好：{styles}。")
        if turn_state.free_text:
            parts.append(f"已应用用户补充说明：{turn_state.free_text}")
        return " ".join(parts)

    def _place_option_impact(self, place: PlannerPlaceSuggestion) -> str:
        if place.type == PlaceType.HOTEL:
            return "保留该酒店后，每日路线会围绕其所在区域展开。"
        if place.type == PlaceType.RESTAURANT:
            return "保留该餐饮点后，会在附近景点之间预留用餐时间。"
        if place.type == PlaceType.SCENIC:
            return "保留该景点后，它会成为某一天主路线的重要节点。"
        return "保留该地点后，它会进入下一版规划。"

    def _parse_places(
        self,
        value,
        fallback: list[PlannerPlaceSuggestion],
        turn_state: PlannerTurnState,
    ) -> list[PlannerPlaceSuggestion]:
        if not isinstance(value, list):
            places = fallback
        else:
            places = []
            for item in value:
                if not isinstance(item, dict) or not item.get("name"):
                    continue
                try:
                    places.append(PlannerPlaceSuggestion.model_validate(item))
                except ValueError:
                    continue
            if not places:
                places = fallback

        parsed: list[PlannerPlaceSuggestion] = []
        for place in places:
            normalized_name = self._normalize_place_name(place.name)
            if (place.placeId and place.placeId in turn_state.rejected_place_ids) or (
                normalized_name in turn_state.rejected_place_names
            ):
                continue
            selected = bool(
                place.selected
                or (place.placeId and place.placeId in turn_state.selected_place_ids)
                or normalized_name in turn_state.selected_place_names
            )
            parsed.append(place.model_copy(update={"selected": selected}))
        return parsed

    def _parse_routes(
        self,
        value,
        fallback: list[PlannerRouteSegment],
    ) -> list[PlannerRouteSegment]:
        if not isinstance(value, list):
            return fallback
        routes: list[PlannerRouteSegment] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            try:
                routes.append(PlannerRouteSegment.model_validate(item))
            except ValueError:
                continue
        return routes

    def _warnings_from_tool(self, result: ToolResult) -> list[AgentWarning]:
        warnings = [
            AgentWarning(code=warning.code, message=warning.message, source=warning.source)
            for warning in result.warnings
        ]
        if result.status == ToolStatus.FAILED and result.errorCode:
            warnings.append(
                AgentWarning(
                    code=result.errorCode,
                    message=result.errorMessage or "工具调用失败。",
                    source=result.tool,
                )
            )
        return warnings

    def _places_from_result(
        self,
        result: ToolResult,
        fallback: list[PlannerPlaceSuggestion] | None = None,
    ) -> list[PlannerPlaceSuggestion]:
        if isinstance(result.data, list):
            return self._places_from_unknown(result.data)
        return fallback or []

    def _places_from_unknown(self, value) -> list[PlannerPlaceSuggestion]:
        if not isinstance(value, list):
            return []
        places: list[PlannerPlaceSuggestion] = []
        for item in value:
            if isinstance(item, PlannerPlaceSuggestion):
                places.append(item)
            elif isinstance(item, dict):
                try:
                    places.append(PlannerPlaceSuggestion.model_validate(item))
                except ValueError:
                    continue
        return places

    def _routes_from_result(self, result: ToolResult) -> list[PlannerRouteSegment]:
        if not isinstance(result.data, list):
            return []
        routes: list[PlannerRouteSegment] = []
        for item in result.data:
            if isinstance(item, PlannerRouteSegment):
                routes.append(item)
            elif isinstance(item, dict):
                try:
                    routes.append(PlannerRouteSegment.model_validate(item))
                except ValueError:
                    continue
        return routes

    def _tool_calls_from_results(self, results: list[ToolResult]) -> list[ToolCall]:
        return [
            ToolCall(
                tool=result.tool,
                status=result.status.value,
                latencyMs=result.latencyMs,
                detail=result.errorMessage,
                retryCount=result.retryCount,
            )
            for result in results
        ]
