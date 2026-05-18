from __future__ import annotations

import time

from app.harness.tool_result import ToolResult, ToolStatus
from app.models import PlannerPlaceSuggestion, PlannerRouteSegment


class RoutePlanTool:
    async def plan_routes(
        self,
        places: list[PlannerPlaceSuggestion],
        day_count: int = 1,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        routable_places = [place for place in places if place.latitude is not None and place.longitude is not None]
        if len(routable_places) < 2:
            return self._tool_result(started, ToolStatus.SKIPPED, [], "Fewer than two places", "地点少于 2 个，暂不需要路线规划。")

        routes: list[PlannerRouteSegment] = []
        for from_place, to_place in zip(routable_places, routable_places[1:]):
            distance_km = self._distance_km(from_place, to_place)
            estimated_minutes = max(int(distance_km / 20 * 60), 8)
            routes.append(
                PlannerRouteSegment(
                    fromPlaceId=from_place.placeId,
                    toPlaceId=to_place.placeId,
                    transportMode="walking" if distance_km <= 1.5 else "taxi_or_public_transport",
                    distanceKm=round(distance_km, 2),
                    estimatedMinutes=estimated_minutes,
                    summary=f"{from_place.name} -> {to_place.name}, about {round(distance_km, 2)} km.",
                    dayIndex=(len(routes) % max(day_count, 1)) + 1,
                )
            )

        return self._tool_result(started, ToolStatus.SUCCESS, routes, None, f"已生成 {len(routes)} 段路线估算。")

    def _distance_km(self, from_place: PlannerPlaceSuggestion, to_place: PlannerPlaceSuggestion) -> float:
        lat_delta = float(to_place.latitude or 0) - float(from_place.latitude or 0)
        lng_delta = float(to_place.longitude or 0) - float(from_place.longitude or 0)
        return ((lat_delta * 111) ** 2 + (lng_delta * 85) ** 2) ** 0.5

    def _tool_result(
        self,
        started: float,
        status: ToolStatus,
        data: list[PlannerRouteSegment],
        detail: str | None,
        user_message: str | None,
    ) -> ToolResult:
        return ToolResult(
            tool="amap_route_plan",
            status=status,
            data=data,
            errorMessage=detail,
            latencyMs=int((time.perf_counter() - started) * 1000),
            userMessage=user_message,
        )
