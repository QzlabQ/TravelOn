from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlencode
from uuid import NAMESPACE_URL, uuid5

import httpx

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.models import AgentRunRequest, PlaceSource, PlaceType, PlannerBookingLink, PlannerPlaceSuggestion


class TransportSearchTool:
    def __init__(self, settings: AgentSettings, client_factory=None) -> None:
        self._settings = settings
        self._client_factory = client_factory

    async def search_flights(
        self,
        request: AgentRunRequest,
        limit: int = 4,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        slots = request.coreSlots

        if not slots.departureCity:
            message = "需要补充出发城市后，才能查询火车票/机票候选。"
            return ToolResult(
                tool="search_flights",
                status=ToolStatus.SKIPPED,
                data=[],
                errorCode="TRANSPORT_DEPARTURE_CITY_MISSING",
                errorMessage=message,
                latencyMs=self._latency_ms(started),
                userMessage=message,
                warnings=[
                    ToolWarning(
                        code="TRANSPORT_DEPARTURE_CITY_MISSING",
                        message=message,
                        source="search_flights",
                    )
                ],
                metadata={"needsInput": "departureCity"},
            )

        if not slots.city or slots.travelStartDate is None:
            message = "缺少目的地或出行日期，已跳过火车票/机票候选查询。"
            return ToolResult(
                tool="search_flights",
                status=ToolStatus.PARTIAL_SUCCESS,
                data=[],
                errorCode="TRANSPORT_REQUIRED_SLOT_MISSING",
                errorMessage=message,
                latencyMs=self._latency_ms(started),
                userMessage=message,
                warnings=[
                    ToolWarning(
                        code="TRANSPORT_REQUIRED_SLOT_MISSING",
                        message=message,
                        source="search_flights",
                    )
                ],
            )

        warnings: list[ToolWarning] = []
        options: list[dict[str, Any]] = []
        base_url = self._settings.travel_gateway_base_url.rstrip("/")
        ticket_types = self._ticket_types(slots.transportPreference)

        try:
            async with self._client() as client:
                for ticket_type in ticket_types:
                    try:
                        response = await client.get(
                            f"{base_url}/transports/tickets",
                            params={
                                "type": ticket_type,
                                "departureCity": slots.departureCity,
                                "arrivalCity": slots.city,
                                "departureDate": slots.travelStartDate.isoformat(),
                                "onlyAvailable": "true",
                                "sortBy": "departure",
                            },
                        )
                        response.raise_for_status()
                        items = response.json()
                    except (httpx.TimeoutException, httpx.HTTPError, ValueError, TypeError) as error:
                        warnings.append(
                            ToolWarning(
                                code=f"{ticket_type}_TICKET_GATEWAY_ERROR",
                                message=f"{self._ticket_type_label(ticket_type)}接口查询失败：{error}",
                                source="search_flights",
                            )
                        )
                        continue

                    if not isinstance(items, list):
                        warnings.append(
                            ToolWarning(
                                code=f"{ticket_type}_TICKET_RESPONSE_INVALID",
                                message=f"{self._ticket_type_label(ticket_type)}接口返回格式异常。",
                                source="search_flights",
                            )
                        )
                        continue

                    options.extend(self._to_option(item, slots.travelStartDate.isoformat()) for item in items if isinstance(item, dict))
        except (httpx.TimeoutException, httpx.HTTPError) as error:
            warnings.append(
                ToolWarning(
                    code="TRANSPORT_GATEWAY_ERROR",
                    message=f"交通数据库接口查询失败：{error}",
                    source="search_flights",
                )
            )

        options = [option for option in options if option][:limit]
        if not options:
            warnings.append(
                ToolWarning(
                    code="TRANSPORT_SEARCH_EMPTY",
                    message="交通数据库暂未返回匹配的火车票/机票候选。",
                    source="search_flights",
                )
            )

        return ToolResult(
            tool="search_flights",
            status=ToolStatus.SUCCESS if options else ToolStatus.PARTIAL_SUCCESS,
            data=options,
            latencyMs=self._latency_ms(started),
            userMessage=f"已从交通数据库整理 {len(options)} 个火车票/机票候选。",
            warnings=warnings,
        )

    def _client(self):
        if self._client_factory is not None:
            return self._client_factory()
        return httpx.AsyncClient(timeout=self._settings.agent_tool_timeout_seconds)

    def _ticket_types(self, preference: str | None) -> list[str]:
        if not preference:
            return ["TRAIN", "FLIGHT"]

        text = preference.strip().lower()
        train_keywords = ["train", "rail", "高铁", "火车", "动车", "铁路", "列车"]
        flight_keywords = ["flight", "plane", "air", "飞机", "机票", "航班", "航空"]
        wants_train = any(keyword in text for keyword in train_keywords)
        wants_flight = any(keyword in text for keyword in flight_keywords)

        if wants_train and not wants_flight:
            return ["TRAIN"]
        if wants_flight and not wants_train:
            return ["FLIGHT"]
        return ["TRAIN", "FLIGHT"]

    def _to_option(self, item: dict[str, Any], departure_date: str) -> dict[str, Any]:
        ticket_type = str(item.get("type") or "").upper()
        if ticket_type not in {"TRAIN", "FLIGHT"}:
            return {}

        route_from = str(item.get("departureCity") or "")
        route_to = str(item.get("arrivalCity") or "")
        code = str(item.get("code") or "")
        provider = str(item.get("carrier") or "")
        price = item.get("price")
        ticket_id = str(item.get("id") or "")
        booking_link = PlannerBookingLink(
            type=ticket_type,
            label="去订火车票" if ticket_type == "TRAIN" else "去订机票",
            url=self._ticket_booking_url(
                ticket_type,
                route_from=route_from,
                route_to=route_to,
                departure_date=departure_date,
                booking_code=code,
            ),
            ticketOfferId=ticket_id or None,
            routeFrom=route_from or None,
            routeTo=route_to or None,
            departureDate=departure_date,
            bookingCode=code or None,
            provider=provider or None,
            price=price if isinstance(price, int | float) else None,
        )
        place = PlannerPlaceSuggestion(
            placeId=uuid5(NAMESPACE_URL, f"ticket:{ticket_type}:{ticket_id or code}:{departure_date}"),
            name=self._transport_place_name(ticket_type, provider, code, route_from, route_to),
            type=PlaceType.TRANSPORT,
            source=PlaceSource.INTERNAL_OFFER,
            address=self._transport_address(item),
            description=self._transport_description(item),
            selected=False,
            tags=[ticket_type.lower(), "database", "bookable"],
            bookingLinks=[booking_link],
            ticketOfferId=ticket_id or None,
            routeFrom=route_from or None,
            routeTo=route_to or None,
            departureDate=departure_date,
            bookingCode=code or None,
            provider=provider or None,
            price=price,
        )

        mode = "train" if ticket_type == "TRAIN" else "flight"
        return {
            "id": ticket_id,
            "type": ticket_type,
            "mode": mode,
            "from": route_from,
            "to": route_to,
            "routeFrom": route_from,
            "routeTo": route_to,
            "departureDate": departure_date,
            "departureTime": item.get("departureTime"),
            "arrivalTime": item.get("arrivalTime"),
            "duration": item.get("duration"),
            "provider": provider,
            "carrier": provider,
            "bookingCode": code,
            "code": code,
            "seatClass": item.get("seatClass"),
            "estimatedPrice": price,
            "price": price,
            "remainingSeats": item.get("remainingSeats"),
            "totalSeats": item.get("totalSeats"),
            "summary": self._transport_summary(item),
            "bookingLink": booking_link.model_dump(mode="json", exclude_none=True),
            "plannerPlace": place.model_dump(mode="json", exclude_none=True),
        }

    def _ticket_booking_url(
        self,
        ticket_type: str,
        *,
        route_from: str,
        route_to: str,
        departure_date: str,
        booking_code: str,
    ) -> str:
        path = "/reservations/trains" if ticket_type == "TRAIN" else "/reservations/flights"
        query = urlencode(
            {
                "routeFrom": route_from,
                "routeTo": route_to,
                "departureDate": departure_date,
                "bookingCode": booking_code,
            }
        )
        return f"{path}?{query}"

    def _transport_place_name(self, ticket_type: str, provider: str, code: str, route_from: str, route_to: str) -> str:
        prefix = "火车票" if ticket_type == "TRAIN" else "机票"
        code_text = f" {code}" if code else ""
        provider_text = f"{provider}" if provider else prefix
        route_text = f"{route_from} → {route_to}" if route_from and route_to else ""
        return " ".join(part for part in [provider_text, code_text.strip(), route_text] if part)

    def _transport_description(self, item: dict[str, Any]) -> str:
        parts = [
            str(item.get("departureTime") or ""),
            str(item.get("arrivalTime") or ""),
            str(item.get("duration") or ""),
            str(item.get("seatClass") or ""),
        ]
        price = item.get("price")
        if isinstance(price, int | float):
            parts.append(f"CNY {int(price)}")
        return "，".join(part for part in parts if part)

    def _transport_summary(self, item: dict[str, Any]) -> str:
        route = f"{item.get('departureCity') or ''} → {item.get('arrivalCity') or ''}".strip()
        code = " ".join(str(part) for part in [item.get("carrier"), item.get("code")] if part)
        time_text = " - ".join(str(part) for part in [item.get("departureTime"), item.get("arrivalTime")] if part)
        price = item.get("price")
        price_text = f"，约 CNY {int(price)}" if isinstance(price, int | float) else ""
        return f"{code}，{route}，{time_text}{price_text}".strip("，")

    def _transport_address(self, item: dict[str, Any]) -> str | None:
        departure = " ".join(str(part) for part in [item.get("departureStationCode"), item.get("departureTerminalName")] if part)
        arrival = " ".join(str(part) for part in [item.get("arrivalStationCode"), item.get("arrivalTerminalName")] if part)
        if departure and arrival:
            return f"{departure} → {arrival}"
        return departure or arrival or None

    def _ticket_type_label(self, ticket_type: str) -> str:
        return "火车票" if ticket_type == "TRAIN" else "机票"

    def _latency_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
