from __future__ import annotations


OUTPUT_CONTRACT_PROMPT = """
Return only one JSON object compatible with AgentRunResponse.
Required fields:
- assistantText: short user-facing answer in Simplified Chinese.
- title: plan title in Simplified Chinese.
- summary: short Simplified Chinese summary string or null.
- markdown: a detailed, actionable Simplified Chinese Markdown itinerary.
- nextQuestion: one useful Simplified Chinese follow-up question or null.
- places: an array of place objects compatible with placeId, name, type, source, internalOfferId,
  amapPoiId, latitude, longitude, address, imageUrl, description, selected, tags. User-facing description must be Simplified Chinese.
- routes: an array of route objects compatible with fromPlaceId, toPlaceId, transportMode,
  distanceKm, estimatedMinutes, polyline, summary. User-facing summary must be Simplified Chinese.

Do not include traceId, toolCalls, warnings, or userFacingEvents. The backend adds them.
If tool evidence is weak, still return useful markdown and reuse candidatePlaces where possible.
Use the responseBudget in the user payload as the upper bound and target length guidance. Do not make
the itinerary overly short when enough evidence is available. Do not invent more than the requested
places/routes, and avoid raw backslash escape-like text in user-facing fields.
""".strip()
