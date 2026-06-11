from __future__ import annotations

import time
from uuid import NAMESPACE_URL, uuid5

import httpx

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.models import PlaceSource, PlaceType, PlannerPlaceSuggestion


class AmapPoiTool:
    def __init__(self, settings: AgentSettings) -> None:
        self._settings = settings

    def is_configured(self) -> bool:
        return bool(self._settings and self._settings.amap_enabled and self._settings.amap_api_key)

    async def search_pois(
        self,
        city: str,
        keywords: list[str],
        limit: int = 8,
        types: str | None = None,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        warnings: list[ToolWarning] = []

        if not self._settings.amap_enabled or not self._settings.amap_api_key:
            return self._tool_result(
                started=started,
                status=ToolStatus.SKIPPED,
                data=[],
                detail="AMAP_API_KEY is not configured",
                user_message="地图服务未配置，已使用 AI 候选地点。",
                warnings=[
                    ToolWarning(
                        code="AMAP_DISABLED",
                        message="高德地图未配置，可能只使用 AI 候选地点。",
                        source="amap",
                    )
                ],
            )

        if not keywords:
            return self._tool_result(
                started=started,
                status=ToolStatus.SKIPPED,
                data=[],
                detail="No keywords",
                user_message="没有可查询的地图关键词。",
            )

        places: list[PlannerPlaceSuggestion] = []
        seen: set[str] = set()
        url = f"{self._settings.amap_base_url.rstrip('/')}/place/text"

        async with httpx.AsyncClient(timeout=self._settings.amap_timeout_seconds) as client:
            for keyword in keywords:
                if len(places) >= limit:
                    break
                try:
                    params = {
                        "key": self._settings.amap_api_key,
                        "city": city,
                        "keywords": keyword,
                        "offset": min(limit, 20),
                        "page": 1,
                        "extensions": "all",
                    }
                    if types:
                        params["types"] = types
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    data = response.json()
                    if data.get("status") != "1":
                        warnings.append(
                            ToolWarning(
                                code="AMAP_QUERY_FAILED",
                                message=data.get("info", "高德地图查询失败。"),
                                source="amap",
                            )
                        )
                        continue

                    for poi in data.get("pois", []):
                        place = self._parse_poi(poi)
                        unique_key = place.amapPoiId or place.name
                        if unique_key in seen:
                            continue
                        seen.add(unique_key)
                        places.append(place)
                        if len(places) >= limit:
                            break
                except (httpx.TimeoutException, httpx.HTTPError, ValueError) as error:
                    warnings.append(
                        ToolWarning(
                            code="AMAP_TIMEOUT_OR_ERROR",
                            message=f"高德地图关键词“{keyword}”查询失败：{error}",
                            source="amap",
                        )
                    )

        status = ToolStatus.SUCCESS if places else ToolStatus.PARTIAL_SUCCESS
        detail = None if places else "No POI results"
        message = f"已找到 {len(places)} 个可展示地点。" if places else "地图暂未返回可用地点，已保留 AI 候选。"
        return self._tool_result(
            started=started,
            status=status,
            data=places,
            detail=detail,
            user_message=message,
            warnings=warnings,
        )

    def _parse_poi(self, poi: dict) -> PlannerPlaceSuggestion:
        longitude: float | None = None
        latitude: float | None = None
        location = poi.get("location")
        if isinstance(location, str) and "," in location:
            raw_lng, raw_lat = location.split(",", 1)
            longitude = self._safe_float(raw_lng)
            latitude = self._safe_float(raw_lat)

        image_urls = self._photo_urls(poi.get("photos"))

        return PlannerPlaceSuggestion(
            placeId=uuid5(NAMESPACE_URL, f"amap:{poi.get('id') or poi.get('name') or 'unnamed'}"),
            name=poi.get("name") or "未命名地点",
            type=self._map_type(poi.get("typecode") or ""),
            source=PlaceSource.AMAP,
            amapPoiId=poi.get("id"),
            latitude=latitude,
            longitude=longitude,
            address=poi.get("address") if isinstance(poi.get("address"), str) else None,
            imageUrl=image_urls[0] if image_urls else None,
            imageUrls=image_urls,
            description=poi.get("type") if isinstance(poi.get("type"), str) else None,
            selected=False,
            tags=[tag for tag in [poi.get("type")] if isinstance(tag, str) and tag],
        )

    def _photo_urls(self, photos) -> list[str]:
        if not isinstance(photos, list):
            return []

        urls: list[str] = []
        for photo in photos:
            if len(urls) >= 3:
                break
            if not isinstance(photo, dict):
                continue
            url = photo.get("url")
            if not isinstance(url, str):
                continue
            url = url.strip()
            if url and url not in urls:
                urls.append(url)
        return urls

    def _map_type(self, typecode: str) -> PlaceType:
        if typecode.startswith("110"):
            return PlaceType.SCENIC
        if typecode.startswith("050"):
            return PlaceType.RESTAURANT
        if typecode.startswith("100"):
            return PlaceType.HOTEL
        if typecode.startswith(("150", "160")):
            return PlaceType.TRANSPORT
        if typecode.startswith("060"):
            return PlaceType.SHOPPING
        return PlaceType.OTHER

    def _safe_float(self, value: str) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _tool_result(
        self,
        *,
        started: float,
        status: ToolStatus,
        data: list[PlannerPlaceSuggestion],
        detail: str | None,
        user_message: str | None,
        warnings: list[ToolWarning] | None = None,
    ) -> ToolResult:
        return ToolResult(
            tool="amap_poi_search",
            status=status,
            data=data,
            errorMessage=detail,
            latencyMs=int((time.perf_counter() - started) * 1000),
            userMessage=user_message,
            warnings=warnings or [],
        )
