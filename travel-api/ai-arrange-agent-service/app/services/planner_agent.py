from __future__ import annotations

from dataclasses import dataclass, field
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
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
    ToolCall,
    UserFacingEvent,
)
from app.services.fallback_plan_builder import FallbackPlanBuilder
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.amap_tool import AmapPoiTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.internal_offer_tool import InternalOfferTool
from app.tools.route_tool import RoutePlanTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool


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

    async def run(self, request: AgentRunRequest) -> AgentRunResponse:
        trace_id = str(uuid4())
        recorder = TraceRecorder(
            trace_id=trace_id,
            conversation_id=str(request.conversationId),
            user_id=str(request.userId),
            enabled=self._policy.trace_enabled,
        )
        context = ToolExecutionContext(
            trace_id=trace_id,
            conversation_id=str(request.conversationId),
            user_id=str(request.userId),
            policy=self._policy,
            recorder=recorder,
            user_message=request.userMessage,
        )
        before_agent_run(recorder, "开始生成旅行规划。")

        missing = request.coreSlots.missing_required_slots()
        if missing:
            response = self._missing_slots_response(request, missing, trace_id, recorder.user_facing_events)
            after_agent_run(recorder, response.status.value, "缺少必要旅行信息，已返回补全提示。")
            response.userFacingEvents = recorder.user_facing_events
            return response

        evidence = await self._run_react_loop(request, context)
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
        )
        tool_results.append(llm_result)
        warnings.extend(self._warnings_from_tool(llm_result))

        if isinstance(llm_result.data, dict) and llm_result.status == ToolStatus.SUCCESS:
            response = self._response_from_llm_payload(
                request=request,
                payload=llm_result.data,
                fallback_places=evidence.places,
                fallback_routes=evidence.routes,
                tool_results=tool_results,
                warnings=warnings,
                trace_id=trace_id,
                user_facing_events=recorder.user_facing_events,
            )
            after_agent_run(recorder, response.status.value, "旅行规划生成完成。")
            response.userFacingEvents = recorder.user_facing_events
            return response

        fallback_result = await self._tool_registry.execute(
            "fallback_plan_builder",
            context,
            request=request,
            places=evidence.places,
            weather=evidence.weather,
            transport_options=evidence.transport_options,
            budget=evidence.budget,
            routes=evidence.routes,
        )
        tool_results.append(fallback_result)
        warnings.extend(self._warnings_from_tool(fallback_result))
        recorder.emit(
            event_type="FALLBACK_USED",
            name="fallback_plan_builder",
            status=fallback_result.status.value,
            message="Fallback plan builder was used.",
            latency_ms=fallback_result.latencyMs,
        )

        data = fallback_result.data if isinstance(fallback_result.data, dict) else {}
        response = AgentRunResponse(
            traceId=trace_id,
            status=AgentStatus.PARTIAL_SUCCESS if warnings else AgentStatus.SUCCESS,
            assistantText=str(data.get("assistantText") or "I prepared a structured fallback plan."),
            title=str(data.get("title") or f"{request.coreSlots.city} pre-trip plan"),
            summary=str(data.get("summary")) if data.get("summary") else None,
            markdown=str(data.get("markdown") or "# Pre-trip plan"),
            nextQuestion=str(data.get("nextQuestion")) if data.get("nextQuestion") else None,
            places=self._places_from_unknown(data.get("places")),
            routes=evidence.routes,
            toolCalls=self._tool_calls_from_results(tool_results),
            warnings=warnings,
            userFacingEvents=recorder.user_facing_events,
        )
        after_agent_run(recorder, response.status.value, "已返回基础旅行规划。")
        response.userFacingEvents = recorder.user_facing_events
        return response

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
                    message="ReAct evidence tool limit reached; reserving execution capacity for fallback.",
                    metadata={"maxEvidenceTools": evidence_tool_limit},
                )
                break

            tools = self._choose_tools_for_step(request, evidence, step_index)[:remaining]
            if not tools:
                break

            context.recorder.emit(
                event_type="REACT_STEP",
                name=f"react_step_{step_index + 1}",
                status="RUNNING",
                message="Selecting travel evidence tools.",
                metadata={"step": step_index + 1, "tools": tools},
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
                    message="Enough travel evidence collected.",
                    metadata={"step": step_index + 1, "toolsUsed": len(evidence.tool_results)},
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
            errorMessage=f"Unsupported ReAct tool: {tool_name}",
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
                input_schema="AgentRunRequest",
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
                input_schema="AgentRunRequest",
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
                input_schema="AgentRunRequest",
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
                input_schema="AgentRunRequest, hotels, transport options",
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
                input_schema="AgentRunRequest, candidate places",
                output_schema="planner JSON object",
                timeout_seconds=policy.max_execution_time_seconds,
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
                input_schema="AgentRunRequest, places",
                output_schema="planner JSON object",
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

    def _missing_slots_response(
        self,
        request: AgentRunRequest,
        missing: list[str],
        trace_id: str,
        user_facing_events: list[UserFacingEvent],
    ) -> AgentRunResponse:
        missing_text = ", ".join(missing)
        title = "Missing required trip information"
        markdown = (
            "# Missing required trip information\n\n"
            f"Please provide: {missing_text}.\n\n"
            "Required fields before planning are city, travelStartDate, and peopleCount."
        )
        return AgentRunResponse(
            traceId=trace_id,
            status=AgentStatus.PARTIAL_SUCCESS,
            assistantText=f"Before planning, please provide: {missing_text}.",
            title=title,
            summary=f"Missing required fields: {missing_text}",
            markdown=markdown,
            nextQuestion=f"Please provide {missing_text}.",
            places=[],
            routes=[],
            toolCalls=[],
            warnings=[
                AgentWarning(
                    code="MISSING_REQUIRED_SLOTS",
                    message=f"Missing required fields: {missing_text}",
                    source="agent",
                )
            ],
            userFacingEvents=user_facing_events,
        )

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
    ) -> AgentRunResponse:
        places = self._parse_places(payload.get("places"), fallback_places, request.selectedPlaceIds)
        routes = self._parse_routes(payload.get("routes"), fallback_routes)
        markdown = str(payload.get("markdown") or "").strip()
        title = str(payload.get("title") or "").strip() or f"{request.coreSlots.city} pre-trip plan"
        summary = str(payload.get("summary") or "").strip() or None
        assistant_text = str(payload.get("assistantText") or "").strip() or "I prepared an updated trip plan."
        next_question = str(payload.get("nextQuestion") or "").strip() or None

        if not markdown:
            assistant_text, title, summary, markdown, places = self._fallback_builder.build(request, places, routes=routes)
            warnings.append(
                AgentWarning(
                    code="MODEL_MARKDOWN_EMPTY",
                    message="Model response did not contain markdown; fallback markdown was used.",
                    source="agent",
                )
            )

        return AgentRunResponse(
            traceId=trace_id,
            status=AgentStatus.PARTIAL_SUCCESS if warnings else AgentStatus.SUCCESS,
            assistantText=assistant_text,
            title=title,
            summary=summary,
            markdown=markdown,
            nextQuestion=next_question,
            places=places,
            routes=routes,
            toolCalls=self._tool_calls_from_results(tool_results),
            warnings=warnings,
            userFacingEvents=user_facing_events,
        )

    def _parse_places(
        self,
        value,
        fallback: list[PlannerPlaceSuggestion],
        selected_place_ids: list[UUID],
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

        selected = {str(place_id) for place_id in selected_place_ids}
        for place in places:
            if place.placeId and str(place.placeId) in selected:
                place.selected = True
        return places

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
                    message=result.errorMessage or "Tool call failed",
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
