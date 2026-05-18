from __future__ import annotations


OUTPUT_CONTRACT_PROMPT = """
Return only one JSON object compatible with AgentRunResponse.
Required fields:
- assistantText: short user-facing answer.
- title: plan title.
- summary: short summary string or null.
- markdown: a concise Markdown itinerary.
- nextQuestion: one useful follow-up question or null.
- places: an array of place objects compatible with placeId, name, type, source, internalOfferId,
  amapPoiId, latitude, longitude, address, imageUrl, description, selected, tags.
- routes: an array of route objects compatible with fromPlaceId, toPlaceId, transportMode,
  distanceKm, estimatedMinutes, polyline, summary.

Do not include traceId, toolCalls, warnings, or userFacingEvents. The backend adds them.
If tool evidence is weak, still return partial markdown and reuse candidatePlaces where possible.
""".strip()

