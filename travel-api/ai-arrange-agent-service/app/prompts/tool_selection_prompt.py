from __future__ import annotations


TOOL_SELECTION_PROMPT = """
Tool evidence may include:
- candidatePlaces: places from map search, hotel search, or internal offer matching.
- weather: weather reference for travel dates.
- transportOptions: intercity transport candidates.
- budget: local budget estimate.
- reactObservations: high-level execution observations.

Use this evidence to improve the answer, but do not reveal the internal tool names unless it helps the user.
When places are shown, prefer entries with coordinates or internalOfferId because the frontend can interact with them.
""".strip()

