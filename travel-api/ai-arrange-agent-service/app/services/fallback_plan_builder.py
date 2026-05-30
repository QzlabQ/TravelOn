from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from app.harness.tool_result import ToolResult, ToolStatus
from app.models import AgentRunRequest, PlaceSource, PlaceType, PlannerPlaceSuggestion, PlannerRouteSegment, PlanningScope


class FallbackPlanBuilder:
    def build(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        routes: list[PlannerRouteSegment] | None = None,
    ) -> tuple[str, str, str, str, list[PlannerPlaceSuggestion]]:
        slots = request.coreSlots
        city = slots.city or "目的地"
        total_days = slots.day_count()
        target_day_index = self._target_day_index(request)
        target_date = self._target_date(request, target_day_index)
        selected_places = self._apply_selection(self._merge_snapshot_places(request, places), request)

        if not selected_places:
            selected_places = self._placeholder_places(request)
        elif not any(place.type != PlaceType.HOTEL for place in selected_places):
            selected_places = [*selected_places, *self._placeholder_places(request)]

        if self._is_day_scope(request):
            title = f"{city}第 {target_day_index} 天行前规划"
            summary = self._summary(slots, total_days, target_day_index, target_date)
        else:
            title = f"{city}{total_days} 天行前规划"
            summary = self._summary(slots, total_days, None, None)
        if request.latestSnapshot and request.latestSnapshot.version is not None:
            assistant_text = (
                f"我已基于已保存的第 {request.latestSnapshot.version} 版，为{city}更新了一版规划。"
                "如果外部接口暂不可用，部分地图和实时信息可能仍是基础参考。"
            )
        else:
            assistant_text = (
                f"我已为{city}生成一版结构化行前规划。"
                "如果外部接口暂不可用，部分地图和实时信息可能仍是基础参考。"
            )
        if self._is_day_scope(request):
            next_question = f"你想确认第 {target_day_index} 天、继续修改，还是进入下一天规划？"
        else:
            next_question = "你想调整酒店区域、路线强度、餐饮偏好，还是必去地点？"
        markdown = self._markdown(
            title=title,
            summary=summary,
            places=selected_places,
            days=total_days,
            weather=weather,
            transport_options=transport_options or [],
            budget=budget,
            routes=routes or [],
            request=request,
            target_day_index=target_day_index if self._is_day_scope(request) else None,
        )
        return assistant_text, title, summary, markdown, selected_places

    async def build_result(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        routes: list[PlannerRouteSegment] | None = None,
        **_,
    ) -> ToolResult:
        assistant_text, title, summary, markdown, selected_places = self.build(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options,
            budget=budget,
            routes=routes,
        )
        return ToolResult(
            tool="fallback_plan_builder",
            status=ToolStatus.SUCCESS,
            data={
                "assistantText": assistant_text,
                "title": title,
                "summary": summary,
                "markdown": markdown,
                "places": selected_places,
                "nextQuestion": "你想继续调整酒店区域、路线强度，还是已选地点？",
            },
            userMessage="已生成基础行程草案。",
        )

    def _apply_selection(
        self,
        places: list[PlannerPlaceSuggestion],
        request: AgentRunRequest,
    ) -> list[PlannerPlaceSuggestion]:
        selected_ids = {str(place_id) for place_id in request.selectedPlaceIds}
        rejected_ids: set[str] = set()
        selected_names: set[str] = set()
        rejected_names: set[str] = set()
        if request.interaction:
            selected_ids.update(str(place_id) for place_id in request.interaction.selectedPlaceIds)
            rejected_ids.update(str(place_id) for place_id in request.interaction.rejectedPlaceIds)
            for option_id in request.interaction.selectedOptionIds:
                self._apply_option_id(option_id, selected_ids, selected_names)
            for option_id in request.interaction.rejectedOptionIds:
                self._apply_option_id(option_id, rejected_ids, rejected_names)

        applied: list[PlannerPlaceSuggestion] = []
        for place in places:
            normalized_name = self._normalize_name(place.name)
            if (place.placeId is not None and str(place.placeId) in rejected_ids) or normalized_name in rejected_names:
                continue
            selected = bool(
                place.selected
                or (place.placeId is not None and str(place.placeId) in selected_ids)
                or normalized_name in selected_names
            )
            applied.append(place.model_copy(update={"selected": selected}))
        return applied

    def _merge_snapshot_places(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
    ) -> list[PlannerPlaceSuggestion]:
        merged: list[PlannerPlaceSuggestion] = []
        seen: set[str] = set()
        for place in [*(request.latestSnapshot.places if request.latestSnapshot else []), *places]:
            key = str(place.placeId) if place.placeId else self._normalize_name(place.name)
            if key in seen:
                continue
            merged.append(place)
            seen.add(key)
        return merged

    def _apply_option_id(self, option_id: str, place_ids: set[str], place_names: set[str]) -> None:
        if option_id.startswith("place:name:"):
            place_names.add(self._normalize_name(option_id.removeprefix("place:name:")))
            return
        if option_id.startswith("place:"):
            raw = option_id.removeprefix("place:")
            if raw:
                place_ids.add(raw)

    def _normalize_name(self, name: str) -> str:
        return " ".join(name.strip().lower().replace("-", " ").split())

    def _placeholder_places(self, request: AgentRunRequest) -> list[PlannerPlaceSuggestion]:
        keywords = self._keywords(request)
        places: list[PlannerPlaceSuggestion] = []
        for keyword in keywords[:5]:
            places.append(
                PlannerPlaceSuggestion(
                    placeId=uuid5(NAMESPACE_URL, f"fallback:{request.coreSlots.city or 'unknown'}:{keyword}"),
                    name=keyword,
                    type=PlaceType.OTHER,
                    source=PlaceSource.AI,
                    description="AI 生成的候选地点，暂缺地图坐标。",
                    selected=False,
                    tags=["fallback"],
                )
            )
        return places

    def _keywords(self, request: AgentRunRequest) -> list[str]:
        keywords = [keyword for keyword in request.coreSlots.mustVisitKeywords if keyword]
        if request.coreSlots.travelStyle:
            keywords.append(request.coreSlots.travelStyle)
        if not keywords:
            keywords = ["景点", "博物馆", "本地餐厅"]
        return keywords

    def _summary(self, slots, days: int, target_day_index: int | None, target_date) -> str:
        parts = [f"共 {days} 天"]
        if target_day_index is not None:
            day_text = f"目标：第 {target_day_index} 天"
            if target_date is not None:
                day_text += f" ({target_date.isoformat()})"
            parts.append(day_text)
        if slots.peopleCount:
            parts.append(f"{slots.peopleCount} 人出行")
        if slots.travelStyle:
            parts.append(f"风格：{slots.travelStyle}")
        if slots.budget:
            parts.append(f"预算：{slots.budget}")
        return "，".join(parts)

    def _markdown(
        self,
        title: str,
        summary: str,
        places: list[PlannerPlaceSuggestion],
        days: int,
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        routes: list[PlannerRouteSegment] | None = None,
        request: AgentRunRequest | None = None,
        target_day_index: int | None = None,
    ) -> str:
        lines = [f"# {title}", "", f"概览：{summary}", ""]
        revision_notes = self._revision_notes(request) if request else []
        if revision_notes:
            lines.extend(["## 修订说明", ""])
            lines.extend(f"- {note}" for note in revision_notes)
            lines.append("")

        if weather:
            lines.extend(["## 天气参考", ""])
            if weather.get("summary"):
                lines.append(f"- {weather['summary']}")
            for tip in weather.get("tips", [])[:3]:
                lines.append(f"- 提醒：{tip}")
            lines.append("")

        if budget:
            lines.extend(["## 预算估算", ""])
            lines.append(f"- {budget.get('summary') or '已生成预算估算。'}")
            breakdown = budget.get("breakdown")
            if isinstance(breakdown, dict):
                for name, amount in breakdown.items():
                    lines.append(f"- {name}: CNY {amount}")
            lines.append("")

        if transport_options:
            lines.extend(["## 到达交通候选", ""])
            for option in transport_options[:3]:
                summary_text = option.get("summary") or f"{option.get('mode')} 到 {option.get('to')}"
                price = option.get("estimatedPrice")
                price_text = f"，约 CNY {price}" if price else ""
                lines.append(f"- {summary_text}{price_text}")
            lines.append("")

        if places:
            lines.extend(["## 推荐地点", ""])
            for place in places:
                marker = "（已选）" if place.selected else ""
                description = f" - {place.description}" if place.description else ""
                lines.append(f"- {place.name}{marker}{description}")
            lines.append("")

        day_numbers = [target_day_index] if target_day_index is not None else list(range(1, days + 1))
        for day in day_numbers:
            day_places = places[:4] if target_day_index is not None else places[day - 1 :: days] if places else []
            lines.extend([f"## 第 {day} 天", ""])
            if day_places:
                names = ", ".join(place.name for place in day_places[:3])
                lines.append(f"- 主路线：{names}")
            else:
                lines.append("- 主路线：先保持轻松节奏，待地图信息补全后再细化。")
            if target_day_index is not None:
                lines.append("- 范围：本草案只覆盖当前目标日，不代表完整行程。")
            lines.append("- 备注：为用餐、交通和天气变化预留缓冲时间。")
            lines.append("")
        if routes:
            lines.extend(["## 路线估算", ""])
            for route in routes[:6]:
                if route.summary:
                    lines.append(f"- {route.summary}")
            lines.append("")
        return "\n".join(lines).strip()

    def _revision_notes(self, request: AgentRunRequest | None) -> list[str]:
        if request is None:
            return []
        notes: list[str] = []
        if request.latestSnapshot and request.latestSnapshot.version is not None:
            notes.append(f"已基于保存版本 {request.latestSnapshot.version} 更新。")
        if request.interaction:
            if request.interaction.selectedOptionIds or request.interaction.selectedPlaceIds:
                notes.append("已保留用户选择的地点或风格选项。")
            if request.interaction.rejectedOptionIds or request.interaction.rejectedPlaceIds:
                notes.append("已从主要推荐中移除用户拒绝的地点选项。")
            if request.interaction.freeText:
                notes.append(f"用户补充要求：{request.interaction.freeText}")
        return notes

    def _is_day_scope(self, request: AgentRunRequest) -> bool:
        return request.planningScope in {PlanningScope.DAY_PLAN, PlanningScope.DAY_REFINE}

    def _target_day_index(self, request: AgentRunRequest) -> int:
        if request.targetDayIndex is not None:
            return request.targetDayIndex
        if request.latestSnapshot and request.latestSnapshot.currentDayIndex is not None:
            return request.latestSnapshot.currentDayIndex
        if request.latestSnapshot and request.latestSnapshot.dayPlans:
            completed = set(request.latestSnapshot.completedDayIndexes)
            completed.update(day.dayIndex for day in request.latestSnapshot.dayPlans if day.status.value == "CONFIRMED")
            for day_index in range(1, request.coreSlots.day_count() + 1):
                if day_index not in completed:
                    return day_index
        return 1

    def _target_date(self, request: AgentRunRequest, target_day_index: int):
        if request.targetDate is not None:
            return request.targetDate
        if request.coreSlots.travelStartDate is None:
            return None
        return request.coreSlots.travelStartDate + timedelta(days=target_day_index - 1)
